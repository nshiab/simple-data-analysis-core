import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function intersection(
  simpleTable: SimpleTable,
  column1: string,
  column2: string,
  newColumn: string,
) {
  const geoType = await simpleTable.getProjection(column1);

  const columns = await simpleTable.getColumns();
  if (columns.includes(newColumn)) {
    await queryDB(
      simpleTable,
      `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE (ST_Intersection("${column1}", "${column2}")::${geoType} AS "${newColumn}") FROM "${simpleTable.name}"`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "intersection()",
        parameters: { column1, column2, newColumn },
      }),
    );
  } else {
    await queryDB(
      simpleTable,
      `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" ${geoType}; UPDATE "${simpleTable.name}" SET "${newColumn}" = ST_Intersection("${column1}", "${column2}")`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "intersection()",
        parameters: { column1, column2, newColumn },
      }),
    );
  }
}
