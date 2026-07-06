import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

export default function removeMissing(
  simpleTable: SimpleTable,
  options: {
    columns?: string | string[];
    missingValues?: (string | number)[];
    invert?: boolean;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeMissing()",
    parameters: { options },
    needsSchema: true,
    buildSelect: (input, types) => {
      const missingValues = options.missingValues ?? [
        "undefined",
        "NaN",
        "null",
        "NULL",
        "",
      ];
      const allColumns = Object.keys(types);
      const columns = stringToArray(options.columns ?? []);
      return removeMissingSelect(
        input,
        allColumns,
        types,
        columns.length === 0 ? allColumns : columns,
        { missingValues, invert: options.invert },
      );
    },
  });
}

function removeMissingSelect(
  input: string,
  allColumns: string[],
  types: TableSchema,
  columns: string[],
  options: {
    missingValues?: (string | number)[];
    invert?: boolean;
  } = {},
) {
  let query = `SELECT ${
    allColumns
      .map((d) => `"${d}"`)
      .join(", ")
  } FROM ${input}
        WHERE`;

  if (options.invert) {
    for (let i = 0; i < columns.length; i++) {
      query += `\n"${columns[i]}" IS NULL OR`;
      if (options.missingValues) {
        for (const otherMissingValue of options.missingValues) {
          if (
            typeof otherMissingValue === "string" &&
            types[columns[i]] === "VARCHAR"
          ) {
            query += `\n"${columns[i]}" = '${otherMissingValue}' OR`;
          } else if (
            typeof otherMissingValue === "number" &&
            ["BIGINT", "DOUBLE"].includes(types[columns[i]])
          ) {
            query += `\n"${columns[i]}" = ${otherMissingValue} OR`;
          }
        }
      }
    }
  } else {
    for (let i = 0; i < columns.length; i++) {
      query += `\n"${columns[i]}" IS NOT NULL AND`;
      if (options.missingValues) {
        for (const otherMissingValue of options.missingValues) {
          if (
            typeof otherMissingValue === "string" &&
            types[columns[i]] === "VARCHAR"
          ) {
            query += `\n"${columns[i]}" != '${otherMissingValue}' AND`;
          } else if (
            typeof otherMissingValue === "number" &&
            ["BIGINT", "DOUBLE"].includes(types[columns[i]])
          ) {
            query += `\n"${columns[i]}" != ${otherMissingValue} AND`;
          }
        }
      }
    }
  }

  return options.invert
    ? query.slice(0, query.length - 3)
    : query.slice(0, query.length - 4);
}
