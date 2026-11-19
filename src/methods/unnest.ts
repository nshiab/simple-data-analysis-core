import foldIdentifier from "../helpers/foldIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import parseValue from "../helpers/parseValue.ts";
import queryDB from "../helpers/queryDB.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type SimpleTable from "../class/SimpleTable.ts";

type UnnestOptions = {
  separator?: string;
  keyColumn?: string;
  valueColumn?: string;
  indexColumn?: string;
  keepEmpty?: boolean;
};

type Format = "text" | "array" | "object";

export default function unnest(
  simpleTable: SimpleTable,
  column: string,
  options: UnnestOptions = {},
) {
  if (typeof column !== "string" || column.length === 0) {
    throw new TypeError("unnest() column must be a non-empty string.");
  }

  if (options === null || typeof options !== "object" || Array.isArray(options)) {
    throw new TypeError(
      'unnest() options must be an object. Pass a text separator as { separator: "," }.',
    );
  }

  options = { ...options };
  const format = requestedFormat(options);
  const parameters = { column, options };
  const { separator } = options;
  if (format !== undefined) {
    queueOp(simpleTable, {
      kind: "fusable",
      method: "unnest()",
      parameters,
      values: separator === undefined ? undefined : [separator],
      needsSchema: true,
      buildSelect: (input, schema) =>
        unnestSelect(input, schema, findColumn(schema, column), format, options),
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
      let format: Format = "array";
      if (source.type === "JSON") {
        const jsonType = `json_type(${quoteIdentifier(source.name)})`;
        const rows = await queryDB(
          simpleTable,
          `SELECT ${jsonType} AS shape FROM ${input} WHERE ${jsonType} <> 'NULL' LIMIT 1`,
          { ...queryOptions, returnData: true },
        );
        const shape = rows?.[0]?.shape;
        if (shape === "OBJECT") {
          format = "object";
        } else if (typeof shape === "string" && shape !== "ARRAY") {
          throw new Error(
            `unnest() column ${quoteIdentifier(source.name)} contains JSON type ${shape}. Use a JSON column containing arrays or objects.`,
          );
        }
      }
      const select = unnestSelect(input, schema, source, format, options);
      await queryDB(simpleTable, `CREATE OR REPLACE TABLE ${input} AS ${select}`, queryOptions);
    },
  });
}

function requestedFormat(options: UnnestOptions): Format | undefined {
  const { separator, keyColumn, valueColumn, indexColumn, keepEmpty } = options;
  if (separator !== undefined && typeof separator !== "string") {
    throw new TypeError("unnest() options.separator must be a string.");
  }
  for (const option of ["keyColumn", "valueColumn", "indexColumn"] as const) {
    const name = options[option];
    if (name !== undefined && (typeof name !== "string" || name.length === 0)) {
      throw new TypeError(`unnest() options.${option} must be a non-empty column name.`);
    }
  }
  if (keepEmpty !== undefined && typeof keepEmpty !== "boolean") {
    throw new TypeError("unnest() options.keepEmpty must be true or false.");
  }

  const objectOptions = keyColumn !== undefined || valueColumn !== undefined;
  if (separator !== undefined) {
    if (objectOptions || indexColumn !== undefined || keepEmpty !== undefined) {
      throw new Error(
        "unnest() use options.separator by itself to split text. Remove the other unnest options.",
      );
    }
    return "text";
  }
  if (indexColumn !== undefined) {
    if (objectOptions) {
      throw new Error(
        "unnest() use options.indexColumn for arrays and lists. Use options.keyColumn or options.valueColumn for JSON objects. Choose the options for one input shape.",
      );
    }
    return "array";
  }
  return objectOptions ? "object" : undefined;
}

function findColumn(schema: TableSchema, column: string): { name: string; type: string } {
  const folded = foldIdentifier(column);
  const match = Object.entries(schema).find(([name]) => foldIdentifier(name) === folded);
  if (match === undefined) {
    throw new Error(
      `unnest() column ${quoteIdentifier(column)} does not exist. Check the column name.`,
    );
  }
  const [name, type] = match;
  return { name, type };
}

function unnestSelect(
  input: string,
  schema: TableSchema,
  source: { name: string; type: string },
  format: Format,
  options: UnnestOptions,
): string {
  const { name, type } = source;
  const column = quoteIdentifier(name);
  const typeError = `unnest() column ${column} has type ${type}.`;
  if (format === "text") {
    if (type !== "VARCHAR") {
      throw new Error(
        `${typeError} options.separator requires a string (VARCHAR) column. Choose a string column or omit the separator to expand a list, array, or JSON object.`,
      );
    }
    return `SELECT * EXCLUDE (${column}), TRIM(UNNEST(SPLIT(${column}, ?))) AS ${column} FROM ${input}`;
  }

  if (format === "object") {
    if (type !== "JSON") {
      throw new Error(
        `${typeError} options.keyColumn and options.valueColumn require a JSON object column. Remove them to expand a list or array.`,
      );
    }
    const key = options.keyColumn ?? "key";
    const value = options.valueColumn ?? "value";
    assertOutputColumns(schema, [key, value], name);
    const json = requireJsonShape(`__sda_source.${column}`, column, "object");
    const entries = `LATERAL json_each(${json}) AS __sda_entry`;
    const join = options.keepEmpty ? `LEFT JOIN ${entries} ON TRUE` : `CROSS JOIN ${entries}`;
    return `SELECT __sda_source.* EXCLUDE (${column}), __sda_entry.key AS ${quoteIdentifier(key)},
        CASE WHEN __sda_entry.type <> 'NULL' THEN __sda_entry.value END AS ${quoteIdentifier(value)}
      FROM ${input} AS __sda_source ${join}`;
  }

  if (type !== "JSON" && !/\[\d*\]$/.test(type)) {
    const expected =
      options.indexColumn !== undefined
        ? "options.indexColumn requires a DuckDB list, fixed-size array, or JSON array."
        : options.keepEmpty !== undefined
          ? "options.keepEmpty requires a list, array, or JSON object."
          : "Choose a list, array, or JSON object.";
    throw new Error(`${typeError} ${expected} To split text, use options.separator by itself.`);
  }

  let list = column;
  if (type === "JSON") {
    list = `CAST(${requireJsonShape(column, column, "array")} AS JSON[])`;
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

function requireJsonShape(expression: string, column: string, shape: "array" | "object"): string {
  const prefix = parseValue(`unnest() column ${column} requires JSON ${shape}s. Found JSON type `);
  return `CASE COALESCE(json_type(${expression}), 'NULL')
    WHEN '${shape.toUpperCase()}' THEN ${expression}
    WHEN 'NULL' THEN NULL
    ELSE error(CONCAT(${prefix}, json_type(${expression}),
      '. Use one JSON shape per column. options.indexColumn applies to arrays. options.keyColumn and options.valueColumn apply to objects.'))
  END`;
}
