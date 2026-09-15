import type SimpleTable from "../class/SimpleTable.ts";
import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import { isNumericScalarType } from "../helpers/prepareNumericFeatures.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default function rowToVector(
  table: SimpleTable,
  columns: string[],
  newColumn: string,
  options: { type?: "float" | "double" } = {},
) {
  if (columns.length === 0) {
    throw new Error(
      "rowToVector() requires at least one numeric scalar input column.",
    );
  }
  const duplicate = findDuplicate(columns);
  if (duplicate !== undefined) {
    throw new Error(
      `rowToVector() received duplicate input column ${
        quoteIdentifier(duplicate)
      }. Each input column must be listed once.`,
    );
  }
  if (
    options.type !== undefined && !["float", "double"].includes(options.type)
  ) {
    throw new Error('rowToVector() options.type must be "float" or "double".');
  }

  columns = [...columns];
  options = structuredClone(options);
  queueOp(table, {
    kind: "fusable",
    method: "rowToVector()",
    parameters: { columns, newColumn, options },
    needsSchema: true,
    outputSchema: (schema) => ({
      ...schema,
      [newColumn]: `${
        resolveElementType(schema, columns, newColumn, options)
      }[${columns.length}]`,
    }),
    buildSelect: (input, schema) => {
      const elementType = resolveElementType(
        schema,
        columns,
        newColumn,
        options,
      );
      const resolved = resolveColumns(schema, columns);
      return `SELECT *, [${
        resolved.map(quoteIdentifier).join(", ")
      }]::${elementType}[${columns.length}] AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}

function resolveElementType(
  schema: TableSchema,
  columns: string[],
  newColumn: string,
  options: { type?: "float" | "double" },
): string {
  const existingOutput = Object.keys(schema).find((column) =>
    column.toLowerCase() === newColumn.toLowerCase()
  );
  if (existingOutput !== undefined) {
    throw new Error(
      `rowToVector() the column ${
        quoteIdentifier(newColumn)
      } already exists. Remove it first or choose a different name for the new column.`,
    );
  }
  assertColumnsExist(
    Object.fromEntries(
      Object.keys(schema).map((
        column,
      ) => [column.toLowerCase(), schema[column]]),
    ),
    columns.map((column) => column.toLowerCase()),
    "rowToVector()",
  );
  const resolved = resolveColumns(schema, columns);
  const nonNumeric = resolved.filter((column) =>
    !isNumericScalarType(schema[column])
  );
  if (nonNumeric.length > 0) {
    throw new Error(
      `rowToVector() requires numeric scalar input columns. The following columns are not numeric: ${
        nonNumeric.map((column) =>
          `${quoteIdentifier(column)} (${schema[column]})`
        ).join(", ")
      }. Convert them to numeric types first.`,
    );
  }
  if (options.type !== undefined) return options.type.toUpperCase();

  const inputTypes = resolved.map((column) => schema[column]);
  if (new Set(inputTypes).size !== 1) {
    throw new Error(
      `rowToVector() cannot infer one vector element type from columns with different types: ${
        resolved.map((column) =>
          `${quoteIdentifier(column)} (${schema[column]})`
        ).join(", ")
      }. Set options.type to "float" or "double".`,
    );
  }
  return inputTypes[0];
}

function resolveColumns(schema: TableSchema, columns: string[]): string[] {
  const available = Object.keys(schema);
  return columns.map((requested) =>
    available.find((column) =>
      column.toLowerCase() === requested.toLowerCase()
    ) ?? requested
  );
}

function findDuplicate(columns: string[]): string | undefined {
  const seen = new Set<string>();
  for (const column of columns) {
    const folded = column.toLowerCase();
    if (seen.has(folded)) return column;
    seen.add(folded);
  }
  return undefined;
}
