import type Simple from "../class/Simple.ts";

export default function mergeOptions(
  simple: Simple,
  options: {
    table: string | null;
    method: string | null;
    parameters: { [key: string]: unknown } | null;
    rowsToLog?: number;
    returnData?: boolean;
    values?: import("@duckdb/node-api").DuckDBValue[];
    noClean?: boolean;
  },
): {
  table: string | null;
  method: string | null;
  parameters: { [key: string]: unknown } | null;
  rowsToLog: number;
  charsToLog: number | undefined;
  returnData: boolean;
  values?: import("@duckdb/node-api").DuckDBValue[];
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
