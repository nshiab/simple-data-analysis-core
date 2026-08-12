import quoteIdentifier from "./quoteIdentifier.ts";
import type { TableSchema } from "./pendingOps.ts";

/**
 * Returns the only geometry column in a table schema.
 *
 * @param types - The table schema to inspect.
 * @param method - The SDA method requesting a geometry column.
 * @param tableName - The name of the table represented by the schema.
 * @returns The name of the only geometry column.
 *
 * @example
 * ```ts
 * const column = findGeoColumnFromSchema(
 *   { geom: "GEOMETRY('EPSG:4326')" },
 *   "area()",
 *   "places",
 * );
 * ```
 */
export default function findGeoColumnFromSchema(
  types: TableSchema,
  method: string,
  tableName: string,
): string {
  const geometryColumns = Object.keys(types).filter((column) =>
    types[column].toLowerCase().includes("geometry")
  ).sort();
  if (geometryColumns.length === 0) {
    throw new Error(
      `${method} could not find a geometry column in table ${
        quoteIdentifier(tableName)
      }. Specify a geometry column explicitly, or add one to the table first.`,
    );
  } else if (geometryColumns.length > 1) {
    throw new Error(
      `${method} found ${geometryColumns.length} geometry columns in table ${
        quoteIdentifier(tableName)
      }: ${
        geometryColumns.map(quoteIdentifier).join(", ")
      }. Specify one explicitly.`,
    );
  }
  return geometryColumns[0];
}
