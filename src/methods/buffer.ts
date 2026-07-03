import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function buffer(
  simpleTable: SimpleTable,
  newColumn: string,
  distance: number,
  options: { column?: string } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  const geoType = await simpleTable.getProjection(column);

  const columns = await simpleTable.getColumns();
  if (columns.includes(newColumn)) {
    await queryDB(
      simpleTable,
      `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE (ST_Buffer("${column}", ${distance})::${geoType} AS "${newColumn}") FROM "${simpleTable.name}"`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "buffer()",
        parameters: { column, newColumn, distance },
      }),
    );
  } else {
    await queryDB(
      simpleTable,
      `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" ${geoType}; UPDATE "${simpleTable.name}" SET "${newColumn}" = ST_Buffer("${column}", ${distance})`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "buffer()",
        parameters: { column, newColumn, distance },
      }),
    );
  }
}
