import type Simple from "../class/Simple.ts";

export default function mergeOptions(
  simple: Simple,
  options: {
    table: string | null;
    method: string | null;
    parameters: { [key: string]: unknown } | null;
    rowsToLog?: number;
    returnData?: boolean;
    debug?: boolean;
    noClean?: boolean;
  },
): {
  table: string | null;
  method: string | null;
  parameters: { [key: string]: unknown } | null;
  rowsToLog: number;
  charsToLog: number | undefined;
  returnData: boolean;
  debug: boolean;
  noClean?: boolean;
} {
  return {
    table: options.table,
    method: options.method,
    parameters: options.parameters,
    rowsToLog: options.rowsToLog ?? simple.rowsToLog,
    charsToLog: simple.charsToLog,
    returnData: options.returnData ?? false,
    debug: options.debug ?? simple.debug,
    noClean: options.noClean,
  };
}
