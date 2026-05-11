import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Returns `true` if the table has one or more columns of type geometry.
 *
 * Uses `getTypes()` to inspect column types and checks for any column
 * whose type normalizes to `"geometry"`.
 *
 * @param table - The SimpleTable instance to inspect.
 * @returns `true` if at least one geometry column exists, `false` otherwise.
 *
 * @example
 * ```ts
 * const hasGeo = await hasGeometryColumn(table);
 * if (hasGeo) {
 *   console.log("This table contains geometry columns");
 * }
 * ```
 */
export default async function hasGeometryColumn(
  table: SimpleTable,
): Promise<boolean> {
  const types = await table.getTypes();
  return Object.values(types).some((t) => t.toLowerCase() === "geometry");
}
