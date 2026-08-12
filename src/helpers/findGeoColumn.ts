import findGeoColumnFromSchema from "./findGeoColumnFromSchema.ts";
import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Returns the only geometry column in a table.
 *
 * @param simpleTable - The table to inspect.
 * @param method - The SDA method requesting a geometry column.
 * @returns A promise resolving to the name of the only geometry column.
 *
 * @example
 * ```ts
 * const column = await findGeoColumn(table, "getGeoData()");
 * ```
 */
export default async function findGeoColumn(
  simpleTable: SimpleTable,
  method: string,
): Promise<string> {
  return findGeoColumnFromSchema(
    await simpleTable.getTypes(),
    method,
    simpleTable.name,
  );
}
