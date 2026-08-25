import type SimpleTable from "../class/SimpleTable.ts";
import mergeOptions from "./mergeOptions.ts";
import parseValue from "./parseValue.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

export default async function loadOsmFile(
  table: SimpleTable,
  file: string,
  context: {
    method: "loadGeoData()" | "loadOSM()";
    parameters: { [key: string]: unknown };
  },
): Promise<void> {
  await queryDB(
    table,
    `INSTALL spatial;
    LOAD spatial;
    INSTALL osmium FROM community;
    LOAD osmium;
    SET geometry_always_xy = true;
    CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS
    SELECT * EXCLUDE (geometry),
      geometry::GEOMETRY('EPSG:4326') AS geom
    FROM osmium_read(${parseValue(file)});`,
    mergeOptions(table, {
      table: table.name,
      method: context.method,
      parameters: context.parameters,
    }),
  );
  table.sdb.spatialLoaded = true;
}
