import type { TableSchema } from "./pendingOps.ts";

/**
 * Returns the only geometry column of a schema. Same behavior as
 * findGeoColumn, but working from a schema instead of querying the table, so
 * it can be used inside fusable fragments at flush time.
 */
export default function findGeoColumnFromSchema(types: TableSchema): string {
  const geometries = Object.values(types).filter(
    (d) => d.toLowerCase().includes("geometry"),
  );
  if (geometries.length === 0) {
    throw new Error("Table contains no geometry columns.");
  } else if (geometries.length > 1) {
    throw new Error(
      "More than one column storing geometries. If the method allows to specify one, do it. Otherwise, use the selectColumns methods beforehand.",
    );
  }
  const column = Object.keys(types).find(
    (d) => types[d].toLowerCase().includes("geometry"),
  );
  if (typeof column !== "string") {
    throw new Error("No column");
  }
  return column;
}
