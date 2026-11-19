import foldIdentifier from "./foldIdentifier.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import type { TableSchema } from "./pendingOps.ts";

/** Resolves a column using DuckDB identifier rules and returns its actual name and type. */
export default function requireColumn(
  schema: TableSchema,
  column: string,
  method: string,
): { name: string; type: string } {
  const folded = foldIdentifier(column);
  const match = Object.entries(schema).find(([name]) => foldIdentifier(name) === folded);
  if (match === undefined) {
    throw new Error(
      `${method} column ${quoteIdentifier(column)} does not exist. Check the column name.`,
    );
  }
  const [name, type] = match;
  return { name, type };
}
