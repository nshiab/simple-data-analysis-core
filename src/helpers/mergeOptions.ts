import type { DuckDBValue as NativeDuckDBValue } from "@duckdb/node-api";

/** @internal DuckDB owns this type; retain its exact binding contract without re-exporting it. */
type DuckDBValue = NativeDuckDBValue;

/**
 * Combines a table or database's logging defaults with query-specific options.
 * Use this helper with `queryDB()` when implementing an extension.
 *
 * @param simple - The logging defaults from a table or database.
 * @param simple.rowsToLog - The default number of rows to display.
 * @param simple.charsToLog - The default maximum characters to display per cell.
 * @param options - Query-specific settings, which take precedence over defaults.
 * @param options.table - The table name used for diagnostics, or `null`.
 * @param options.method - The calling method used for diagnostics, or `null`.
 * @param options.parameters - Arguments included in error diagnostics, or `null`.
 * @param options.rowsToLog - Overrides the default number of displayed rows.
 * @param options.returnData - Whether to return converted rows. Defaults to false.
 * @param options.values - DuckDB-native values bound to SQL placeholders, in order.
 * @param options.noClean - Whether to preserve the SQL text without cleaning it.
 * @returns The merged query options without modifying either argument.
 *
 * @example
 * ```ts
 * import { mergeOptions } from "@nshiab/simple-data-analysis-core/helpers";
 *
 * const options = mergeOptions(sdb, {
 *   table: null,
 *   method: "example()",
 *   parameters: null,
 *   returnData: true,
 * });
 * console.log(options.rowsToLog, options.returnData);
 * ```
 */
export default function mergeOptions(
  simple: { rowsToLog: number; charsToLog: number | undefined },
  options: {
    table: string | null;
    method: string | null;
    parameters: { [key: string]: unknown } | null;
    rowsToLog?: number;
    returnData?: boolean;
    values?: DuckDBValue[];
    noClean?: boolean;
  },
): {
  table: string | null;
  method: string | null;
  parameters: { [key: string]: unknown } | null;
  rowsToLog: number;
  charsToLog: number | undefined;
  returnData: boolean;
  values?: DuckDBValue[];
  noClean?: boolean;
} {
  return {
    table: options.table,
    method: options.method,
    parameters: options.parameters,
    rowsToLog: options.rowsToLog ?? simple.rowsToLog,
    charsToLog: simple.charsToLog,
    returnData: options.returnData ?? false,
    values: options.values,
    noClean: options.noClean,
  };
}
