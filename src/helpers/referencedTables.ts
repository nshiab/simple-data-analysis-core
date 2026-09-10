import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import scanSQL from "./scanSQL.ts";
import foldIdentifier from "./foldIdentifier.ts";
import { getRegisteredTables } from "./tableRegistry.ts";

/**
 * Finds registered table identifiers in SQL, excluding literals and comments.
 * Matching is conservative: column names and aliases also count as references.
 * DuckDB folds ASCII letters in both quoted and unquoted identifiers.
 */
export default function referencedTables(
  sql: readonly string[],
  sdb: SimpleDB,
): SimpleTable[] {
  const identifiers = new Set<string>();
  for (const fragment of sql) {
    for (const token of scanSQL(fragment)) {
      if (token.kind === "quoted" && token.text.startsWith('"')) {
        identifiers.add(
          foldIdentifier(token.text.slice(1, -1).replaceAll('""', '"')),
        );
      } else if (
        token.kind === "sql" && /^[\p{L}_][\p{L}\p{N}_$]*$/u.test(token.text)
      ) {
        identifiers.add(foldIdentifier(token.text));
      }
    }
  }
  return getRegisteredTables(sdb).filter((table) =>
    identifiers.has(foldIdentifier(table.name))
  );
}
