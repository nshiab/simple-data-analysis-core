import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type { DuckDBValue } from "@duckdb/node-api";

export default function removeMissing(
  simpleTable: SimpleTable,
  options: {
    columns?: string | string[];
    missingValues?: (string | number)[];
    invert?: boolean;
  } = {},
) {
  options = structuredClone(options);
  const missingValues = options.missingValues ?? [
    "undefined",
    "NaN",
    "null",
    "NULL",
    "",
  ];
  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeMissing()",
    parameters: { options },
    needsSchema: true,
    preservesSchema: true,
    values: (types) => {
      const columns = getRemoveMissingColumns(types, options.columns);
      return getRemoveMissingValues(types, columns, missingValues);
    },
    buildSelect: (input, types) => {
      const allColumns = Object.keys(types);
      return removeMissingSelect(
        input,
        allColumns,
        types,
        getRemoveMissingColumns(types, options.columns),
        { missingValues, invert: options.invert },
      );
    },
  });
}

function getRemoveMissingColumns(
  types: TableSchema,
  selectedColumns?: string | string[],
): string[] {
  const columns = stringToArray(selectedColumns ?? []);
  return columns.length === 0 ? Object.keys(types) : columns;
}

function getRemoveMissingValues(
  types: TableSchema,
  columns: string[],
  missingValues: (string | number)[],
): DuckDBValue[] {
  return columns.flatMap((column) =>
    missingValues.filter((missingValue) =>
      typeof missingValue === "string"
        ? types[column] === "VARCHAR"
        : ["BIGINT", "DOUBLE"].includes(types[column])
    )
  );
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
      .map((d) => `${quoteIdentifier(d)}`)
      .join(", ")
  } FROM ${input}
        WHERE`;

  if (options.invert) {
    for (let i = 0; i < columns.length; i++) {
      query += `\n${quoteIdentifier(columns[i])} IS NULL OR`;
      if (options.missingValues) {
        for (const otherMissingValue of options.missingValues) {
          if (
            typeof otherMissingValue === "string" &&
            types[columns[i]] === "VARCHAR"
          ) {
            query += `\n${quoteIdentifier(columns[i])} = ? OR`;
          } else if (
            typeof otherMissingValue === "number" &&
            ["BIGINT", "DOUBLE"].includes(types[columns[i]])
          ) {
            query += `\n${quoteIdentifier(columns[i])} = ? OR`;
          }
        }
      }
    }
  } else {
    for (let i = 0; i < columns.length; i++) {
      query += `\n${quoteIdentifier(columns[i])} IS NOT NULL AND`;
      if (options.missingValues) {
        for (const otherMissingValue of options.missingValues) {
          if (
            typeof otherMissingValue === "string" &&
            types[columns[i]] === "VARCHAR"
          ) {
            query += `\n${quoteIdentifier(columns[i])} != ? AND`;
          } else if (
            typeof otherMissingValue === "number" &&
            ["BIGINT", "DOUBLE"].includes(types[columns[i]])
          ) {
            query += `\n${quoteIdentifier(columns[i])} != ? AND`;
          }
        }
      }
    }
  }

  return options.invert
    ? query.slice(0, query.length - 3)
    : query.slice(0, query.length - 4);
}
