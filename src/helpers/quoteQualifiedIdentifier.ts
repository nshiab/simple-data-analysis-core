import quoteIdentifier from "./quoteIdentifier.ts";

/**
 * Quotes a SQL identifier together with the relation that owns it.
 *
 * Qualifying column references prevents DuckDB from resolving a relation name
 * as its row struct when a missing column has the same name as the relation.
 *
 * @param relation - The table or relation containing the identifier.
 * @param identifier - The identifier to qualify.
 * @returns The separately quoted relation and identifier joined by a period.
 *
 * @example
 * ```ts
 * quoteQualifiedIdentifier("people", "full name");
 * // '"people"."full name"'
 * ```
 */
export default function quoteQualifiedIdentifier(
  relation: string,
  identifier: string,
): string {
  return `${quoteIdentifier(relation)}.${quoteIdentifier(identifier)}`;
}
