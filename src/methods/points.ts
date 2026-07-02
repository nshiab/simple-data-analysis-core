import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function points(
  simpleTable: SimpleTable,
  columnLat: string,
  columnLon: string,
  newColumn: string,
) {
  await queryDB(
    simpleTable,
    (await simpleTable.getColumns()).includes(newColumn)
      ? `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE (ST_Point("${columnLon}", "${columnLat}")::GEOMETRY('EPSG:4326') AS "${newColumn}") FROM "${simpleTable.name}"`
      : `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; ALTER TABLE "${simpleTable.name}" ADD COLUMN "${newColumn}" GEOMETRY('EPSG:4326'); UPDATE "${simpleTable.name}" SET "${newColumn}" = ST_Point("${columnLon}", "${columnLat}");`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "points()",
      parameters: { columnLat, columnLon, newColumn },
    }),
  );
}
