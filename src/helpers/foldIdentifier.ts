/** Matches DuckDB's ASCII case folding for quoted and unquoted identifiers. */
export default function foldIdentifier(identifier: string): string {
  return identifier.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
