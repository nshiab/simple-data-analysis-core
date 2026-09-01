import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

/**
 * Loads the spatial extension once per connection, so geospatial operations
 * can fuse as plain SELECT fragments instead of each being multi-statement.
 */
export default async function ensureSpatial(
  simpleTable: SimpleTable,
): Promise<void> {
  if (simpleTable.sdb.spatialLoaded) {
    return;
  }
  await queryDB(
    simpleTable,
    `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;`,
    mergeOptions(simpleTable, {
      table: null,
      method: null,
      parameters: null,
    }),
  );
  simpleTable.sdb.spatialLoaded = true;
}
