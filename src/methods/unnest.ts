import foldIdentifier from "../helpers/foldIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type SimpleTable from "../class/SimpleTable.ts";

type UnnestOptions = {
  keyColumn?: string;
  valueColumn?: string;
  indexColumn?: string;
  keepEmpty?: boolean;
};

type Shape = "array" | "object";

export default function unnest(
  simpleTable: SimpleTable,
  column: string,
  separatorOrOptions: string | UnnestOptions = {},
) {
  if (typeof separatorOrOptions === "string") {
    queueOp(simpleTable, {
      kind: "fusable",
      method: "unnest()",
      parameters: { column, separator: separatorOrOptions },
      values: [separatorOrOptions],
      needsSchema: false,
      buildSelect: (input) =>
        `SELECT
  * EXCLUDE ${quoteIdentifier(column)},
  TRIM(UNNEST(SPLIT(${quoteIdentifier(column)}, ?))) AS ${quoteIdentifier(column)}
FROM ${input}`,
    });
    return;
  }

  const options = { ...separatorOrOptions };
  const parameters = { column, options };
  const objectOptions = options.keyColumn !== undefined || options.valueColumn !== undefined;
  if (objectOptions && options.indexColumn !== undefined) {
    throw new Error("unnest() indexColumn cannot be used with keyColumn or valueColumn.");
  }

  const shape: Shape | undefined = objectOptions
    ? "object"
    : options.indexColumn === undefined
      ? undefined
      : "array";
  if (shape !== undefined) {
    queueOp(simpleTable, {
      kind: "fusable",
      method: "unnest()",
      parameters,
      needsSchema: true,
      buildSelect: (input, schema) =>
        unnestSelect(input, schema, findColumn(schema, column), shape, options),
    });
    return;
  }

  // The JSON column type alone cannot tell us which output columns to use.
  // Inspect the materialized input so the probe and expansion see the same data.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "unnest()",
    parameters,
    execute: async () => {
      const schema = await simpleTable.getTypes();
      const source = findColumn(schema, column);
      const input = quoteIdentifier(simpleTable.name);
      const queryOptions = mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "unnest()",
        parameters,
      });
      let shape: Shape = "array";
      if (source.type === "JSON") {
        const jsonType = `json_type(${quoteIdentifier(source.name)})`;
        const rows = await queryDB(
          simpleTable,
          `SELECT ${jsonType} AS shape FROM ${input} WHERE ${jsonType} <> 'NULL' LIMIT 1`,
          { ...queryOptions, returnData: true },
        );
        shape = rows?.[0]?.shape === "OBJECT" ? "object" : "array";
      }
      const select = unnestSelect(input, schema, source, shape, options);
      await queryDB(simpleTable, `CREATE OR REPLACE TABLE ${input} AS ${select}`, queryOptions);
    },
  });
}

function findColumn(schema: TableSchema, column: string): { name: string; type: string } {
  const folded = foldIdentifier(column);
  const match = Object.entries(schema).find(([name]) => foldIdentifier(name) === folded);
  if (match === undefined) {
    throw new Error(`unnest() the column ${quoteIdentifier(column)} does not exist.`);
  }
  const [name, type] = match;
  return { name, type };
}

function unnestSelect(
  input: string,
  schema: TableSchema,
  source: { name: string; type: string },
  shape: Shape,
  options: UnnestOptions,
): string {
  const { name, type } = source;
  const column = quoteIdentifier(name);
  if (shape === "object") {
    if (type !== "JSON") {
      throw new Error(
        `unnest() ${column} has type ${type}. keyColumn and valueColumn require a JSON object column.`,
      );
    }
    const key = options.keyColumn ?? "key";
    const value = options.valueColumn ?? "value";
    assertOutputColumns(schema, [key, value], name);
    const json = requireJsonShape(`__sda_source.${column}`, "object");
    const entries = `LATERAL json_each(${json}) AS __sda_entry`;
    const join = options.keepEmpty ? `LEFT JOIN ${entries} ON TRUE` : `CROSS JOIN ${entries}`;
    return `SELECT __sda_source.* EXCLUDE (${column}), __sda_entry.key AS ${quoteIdentifier(key)},
        CASE WHEN __sda_entry.type <> 'NULL' THEN __sda_entry.value END AS ${quoteIdentifier(value)}
      FROM ${input} AS __sda_source ${join}`;
  }

  if (type !== "JSON" && !/\[\d*\]$/.test(type)) {
    throw new Error(
      `unnest() ${column} has type ${type}. Use a list, array, JSON column, or a delimiter for text.`,
    );
  }

  let list = column;
  if (type === "JSON") {
    list = `CAST(${requireJsonShape(column, "array")} AS JSON[])`;
  } else if (!type.endsWith("[]")) {
    // Slicing a fixed-size array gives a list and preserves SQL NULLs.
    list = `list_slice(${column}, 1, -1)`;
  }
  const elements = options.keepEmpty
    ? `CASE WHEN COALESCE(length(${list}), 0) = 0 THEN [NULL] ELSE ${list} END`
    : list;
  let index = "";
  if (options.indexColumn !== undefined) {
    assertOutputColumns(schema, [options.indexColumn]);
    // DuckDB pads the position with NULL when the element expression
    // inserts a row for an empty list.
    index = `, generate_subscripts(${list}, 1) AS ${quoteIdentifier(options.indexColumn)}`;
  }
  return `SELECT * EXCLUDE (${column}), UNNEST(${elements}) AS ${column}${index} FROM ${input}`;
}

function assertOutputColumns(schema: TableSchema, columns: string[], excluded?: string): void {
  const used = new Set(
    Object.keys(schema)
      .filter((name) => name !== excluded)
      .map(foldIdentifier),
  );
  for (const column of columns) {
    const folded = foldIdentifier(column);
    if (used.has(folded)) {
      throw new Error(
        `unnest() the output column ${quoteIdentifier(column)} already exists. Choose a different name.`,
      );
    }
    used.add(folded);
  }
}

function requireJsonShape(column: string, shape: Shape): string {
  return `CASE COALESCE(json_type(${column}), 'NULL')
    WHEN '${shape.toUpperCase()}' THEN ${column}
    WHEN 'NULL' THEN NULL
    ELSE error('unnest() expected a JSON ${shape}. The column must contain one shape.')
  END`;
}
