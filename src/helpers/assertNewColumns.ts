import foldIdentifier from "./foldIdentifier.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
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
 * @param options.checkDuckDBNameCollisions - Compare names using DuckDB identifier
 *   folding and check for collisions among the new names too.
 */
export default function assertNewColumns(
  schema: TableSchema,
  newColumns: string[],
  method: string,
  allowInPlace: string[] = [],
  options: { checkDuckDBNameCollisions?: boolean } = {},
): void {
  let used: Set<string> | undefined;
  if (options.checkDuckDBNameCollisions) {
    const replaceable = new Set(allowInPlace.map(foldIdentifier));
    used = new Set(
      Object.keys(schema)
        .map(foldIdentifier)
        .filter((name) => !replaceable.has(name)),
    );
  }
  for (const column of newColumns) {
    const name = used === undefined ? column : foldIdentifier(column);
    if (used?.has(name) ?? (schema[column] !== undefined && !allowInPlace.includes(column))) {
      throw new Error(
        `${method} the column ${quoteIdentifier(
          column,
        )} already exists. Remove it first or choose a different name for the new column.`,
      );
    }
    used?.add(name);
  }
}
