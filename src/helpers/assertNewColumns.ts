import type { TableSchema } from "./pendingOps.ts";

/**
 * Throws if any of the target columns already exists in the schema, matching
 * the behavior of the v1 methods that added columns with `ALTER TABLE ADD`
 * (which errored on a duplicate). Without this guard, a `SELECT *, expr AS
 * col` that collides with an existing column is silently renamed to `col_1`
 * by DuckDB, so the operation would appear to succeed while leaving the
 * original column untouched.
 *
 * @param schema - The schema of the operation's input.
 * @param newColumns - The names of the columns the operation adds.
 * @param method - The method name, for the error message (e.g. "cloneColumn()").
 * @param allowInPlace - Columns whose name may already exist because the
 *   operation overwrites them in place rather than adding a new column.
 */
export default function assertNewColumns(
  schema: TableSchema,
  newColumns: string[],
  method: string,
  allowInPlace: string[] = [],
): void {
  for (const column of newColumns) {
    if (schema[column] !== undefined && !allowInPlace.includes(column)) {
      throw new Error(
        `${method} the column "${column}" already exists. Remove it first or choose a different name for the new column.`,
      );
    }
  }
}
