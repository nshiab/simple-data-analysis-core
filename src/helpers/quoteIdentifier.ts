/**
 * Quotes one SQL identifier and escapes embedded double quotes.
 * Use this for library-generated table, column, schema, database, and alias
 * names. User-authored SQL expressions must remain unmodified.
 *
 * @param identifier - The identifier to quote.
 * @returns The identifier wrapped in double quotes with embedded quotes doubled.
 *
 * @example
 * ```ts
 * quoteIdentifier('people "archive"');
 * // '"people ""archive"""'
 * ```
 */
export default function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`;
}
