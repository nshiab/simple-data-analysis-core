import quoteIdentifier from "./quoteIdentifier.ts";
import keepNumericalColumns from "./keepNumericalColumns.ts";
import type { TableSchema } from "./pendingOps.ts";

/**
 * Validates the column options shared by numerical pair analyses.
 *
 * @param types - The schema of the table being analyzed.
 * @param options - The optional x and y columns selected by the caller.
 * @param method - The SDA method performing the analysis.
 * @param tableName - The name of the table being analyzed.
 * @returns All numeric columns in the table schema.
 *
 * @example
 * ```ts
 * const columns = validateNumericalAnalysis(
 *   { x: "DOUBLE", y: "BIGINT" },
 *   { x: "x" },
 *   "correlations()",
 *   "measurements",
 * );
 * ```
 */
export default function validateNumericalAnalysis(
  types: TableSchema,
  options: { x?: string; y?: string },
  method: string,
  tableName: string,
): string[] {
  if (options.x === undefined && options.y !== undefined) {
    throw new Error(
      `${method} options.y cannot be used without options.x. Provide options.x, or omit options.y to analyze every numeric column pair.`,
    );
  }

  const numericalColumns = keepNumericalColumns(types);
  const requestedColumns = [options.x, options.y].filter(
    (column): column is string => column !== undefined,
  );
  for (const column of requestedColumns) {
    const type = types[column];
    if (type === undefined) {
      const availableColumns = Object.keys(types).sort();
      throw new Error(
        `${method} could not find column ${quoteIdentifier(column)} in table ${
          quoteIdentifier(tableName)
        }. Available columns: ${
          availableColumns.map(quoteIdentifier).join(", ")
        }.`,
      );
    }
    if (!numericalColumns.includes(column)) {
      throw new Error(
        `${method} requires numeric columns, but column ${
          quoteIdentifier(column)
        } in table ${quoteIdentifier(tableName)} has type ${type}. Convert ${
          quoteIdentifier(column)
        } to a numeric type first.`,
      );
    }
  }

  if (options.y === undefined && numericalColumns.length < 2) {
    const found = numericalColumns.length === 0
      ? ""
      : `: ${numericalColumns.map(quoteIdentifier).join(", ")}`;
    const missingCount = 2 - numericalColumns.length;
    const columnsToConvert = numericalColumns.length === 0
      ? `${missingCount} columns`
      : `${missingCount} more column${missingCount === 1 ? "" : "s"}`;
    throw new Error(
      `${method} requires at least 2 numeric columns in table ${
        quoteIdentifier(tableName)
      }, but found ${numericalColumns.length}${found}. Convert at least ${columnsToConvert} to ${
        missingCount === 1 ? "a numeric type" : "numeric types"
      } first.`,
    );
  }

  return numericalColumns;
}
