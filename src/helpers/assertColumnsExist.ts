import type { TableSchema } from "./pendingOps.ts";

/**
 * Throws if any of the named columns is absent from the schema. The mirror of
 * `assertNewColumns`: where that guard rejects a column that unexpectedly
 * already exists, this one rejects a column that should exist but doesn't.
 *
 * It backs methods whose SQL silently tolerates a missing column instead of
 * erroring — notably `SELECT * RENAME (...)`, which drops a rename whose
 * source column is absent rather than failing, so a typo would pass unnoticed.
 *
 * @param schema - The schema of the operation's input.
 * @param columns - The names of the columns the operation reads.
 * @param method - The method name, for the error message (e.g. "renameColumns()").
 */
export default function assertColumnsExist(
  schema: TableSchema,
  columns: string[],
  method: string,
): void {
  const missing = columns.filter((column) => schema[column] === undefined);
  if (missing.length > 0) {
    const plural = missing.length > 1;
    throw new Error(
      `${method} the column${plural ? "s" : ""} ${
        missing.map((column) => `"${column}"`).join(", ")
      } ${
        plural ? "do" : "does"
      } not exist. Check for typos, or load the data first.`,
    );
  }
}
