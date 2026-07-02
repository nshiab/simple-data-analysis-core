import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function fixGeo(
  simpleTable: SimpleTable,
  column?: string,
) {
  const col = column ?? (await findGeoColumn(simpleTable));
  const geoType = await simpleTable.getProjection(col);

  await queryDB(
    simpleTable,
    `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE (ST_MakeValid("${col}")::${geoType} AS "${col}") FROM "${simpleTable.name}"`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "fixGeo()",
      parameters: { column },
    }),
  );
}
