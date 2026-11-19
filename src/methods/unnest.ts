import assertNewColumns from "../helpers/assertNewColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import requireColumn from "../helpers/requireColumn.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type SimpleTable from "../class/SimpleTable.ts";

type UnnestOptions = {
  separator?: string;
  keyColumn?: string;
  valueColumn?: string;
  indexColumn?: string;
  keepEmpty?: boolean;
};

type UnnestMode = "text" | "array" | "object";

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
  const mode = validateOptionsAndGetMode(options);
  const parameters = { column, options };
  const { separator } = options;
  queueOp(simpleTable, {
    kind: "fusable",
    method: "unnest()",
    parameters,
    needsSchema: true,
    values: separator === undefined ? undefined : [separator],
    buildSelect: (input, schema) => {
      const source = requireColumn(schema, column, "unnest()");
      if (source.type !== "JSON" || mode === "text") {
        return unnestSelect(input, schema, source, mode ?? "array", options);
      }

      // Check the materialized input before downstream operations can filter
      // it. Expansion can then fuse with those operations.
      return {
        prepareSelect: async (materializedInput) => {
          const columnName = quoteIdentifier(source.name);
          const jsonType = `json_type(${columnName})`;
          const queryOptions = mergeOptions(simpleTable, {
            table: simpleTable.name,
            method: "unnest()",
            parameters,
            returnData: true,
          });
          let jsonMode = mode;
          if (jsonMode === undefined) {
            const rows = await queryDB(
              simpleTable,
              `SELECT ${jsonType} AS shape FROM ${materializedInput} WHERE ${jsonType} <> 'NULL' LIMIT 1`,
              queryOptions,
            );
            const shape = rows?.[0]?.shape;
            if (typeof shape === "string" && shape !== "ARRAY" && shape !== "OBJECT") {
              throw new Error(
                `unnest() column ${columnName} contains JSON type ${shape}. Use a JSON column containing arrays or objects.`,
              );
            }
            jsonMode = shape === "OBJECT" ? "object" : "array";
          }
          const select = unnestSelect(materializedInput, schema, source, jsonMode, options);
          const invalid = await queryDB(
            simpleTable,
            `SELECT ${jsonType} AS shape FROM ${materializedInput}
WHERE ${jsonType} NOT IN ('NULL', '${jsonMode.toUpperCase()}') LIMIT 1`,
            queryOptions,
          );
          const shape = invalid?.[0]?.shape;
          if (typeof shape === "string") {
            throw new Error(
              `unnest() column ${columnName} requires JSON ${jsonMode}s. Found JSON type ${shape}. Use one JSON shape per column. options.indexColumn applies to arrays. options.keyColumn and options.valueColumn apply to objects.`,
            );
          }
          return select;
        },
      };
    },
  });
}

function validateOptionsAndGetMode(options: UnnestOptions): UnnestMode | undefined {
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

function unnestSelect(
  input: string,
  schema: TableSchema,
  source: { name: string; type: string },
  mode: UnnestMode,
  options: UnnestOptions,
): string {
  const { name, type } = source;
  const column = quoteIdentifier(name);
  const typeError = `unnest() column ${column} has type ${type}.`;
  if (mode === "text") {
    if (type !== "VARCHAR") {
      throw new Error(
        `${typeError} options.separator requires a string (VARCHAR) column. Choose a string column or omit the separator to expand a list, array, or JSON object.`,
      );
    }
    return `SELECT * EXCLUDE (${column}), TRIM(UNNEST(SPLIT(${column}, ?))) AS ${column} FROM ${input}`;
  }

  if (mode === "object") {
    if (type !== "JSON") {
      throw new Error(
        `${typeError} options.keyColumn and options.valueColumn require a JSON object column. Remove them to expand a list or array.`,
      );
    }
    const key = options.keyColumn ?? "key";
    const value = options.valueColumn ?? "value";
    assertNewColumns(schema, [key, value], "unnest()", [name], { caseInsensitive: true });
    const jsonColumn = `__sda_source.${column}`;
    const json = `CASE WHEN json_type(${jsonColumn}) <> 'NULL' THEN ${jsonColumn} END`;
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
    list = `CAST(${column} AS JSON[])`;
  } else if (!type.endsWith("[]")) {
    // Slicing a fixed-size array gives a list and preserves SQL NULLs.
    list = `list_slice(${column}, 1, -1)`;
  }
  const elements = options.keepEmpty
    ? `CASE WHEN COALESCE(length(${list}), 0) = 0 THEN [NULL] ELSE ${list} END`
    : list;
  let index = "";
  if (options.indexColumn !== undefined) {
    assertNewColumns(schema, [options.indexColumn], "unnest()", [], { caseInsensitive: true });
    // DuckDB pads the position with NULL when the element expression
    // inserts a row for an empty list.
    index = `, generate_subscripts(${list}, 1) AS ${quoteIdentifier(options.indexColumn)}`;
  }
  return `SELECT * EXCLUDE (${column}), UNNEST(${elements}) AS ${column}${index} FROM ${input}`;
}
