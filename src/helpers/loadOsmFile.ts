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
    columns?: string[];
    conditions?: string;
  },
): Promise<void> {
  const selectColumns = context.columns !== undefined &&
      context.columns.length > 0
    ? context.columns.map(quoteIdentifier).join(", ")
    : "* EXCLUDE (geometry)";
  const conditions = context.conditions ? ` WHERE ${context.conditions}` : "";
  // Expose geom before filtering, even when it is not selected for output.
  await queryDB(
    table,
    `INSTALL spatial;
    LOAD spatial;
    INSTALL osmium FROM community;
    LOAD osmium;
    SET geometry_always_xy = true;
    CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS
    SELECT ${selectColumns}
    FROM (
      SELECT *, geometry::GEOMETRY('EPSG:4326') AS geom
      FROM osmium_read(${parseValue(file)})
    )${conditions};`,
    mergeOptions(table, {
      table: table.name,
      method: context.method,
      parameters: context.parameters,
    }),
  );
  table.sdb.spatialLoaded = true;
}
