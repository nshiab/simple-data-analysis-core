import quoteIdentifier from "./quoteIdentifier.ts";

/**
 * Formats a missing-table error with the requested and available table names.
 *
 * @param method - The SDA method looking up the tables.
 * @param missingTables - The requested table names that were not found.
 * @param availableTables - The table names currently available.
 * @returns An actionable missing-table error message.
 *
 * @example
 * ```ts
 * const message = formatMissingTables(
 *   "getTable()",
 *   ["missing"],
 *   ["votes", "districts"],
 * );
 * ```
 */
export default function formatMissingTables(
  method: string,
  missingTables: string[],
  availableTables: string[],
): string {
  const missing = [...missingTables].sort();
  const available = [...availableTables].sort();
  const missingDescription = missing.length === 1
    ? `table ${quoteIdentifier(missing[0])}`
    : `tables ${missing.map(quoteIdentifier).join(", ")}`;
  const availableDescription = available.length === 0
    ? "No tables are currently available."
    : `Available tables: ${available.map(quoteIdentifier).join(", ")}.`;
  return `${method} could not find ${missingDescription}. ${availableDescription}`;
}
