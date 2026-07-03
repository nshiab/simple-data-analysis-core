import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function reducePrecision(
  simpleTable: SimpleTable,
  decimals: number,
  options: { column?: string } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);
  const geoType = await simpleTable.getProjection(column);

  await queryDB(
    simpleTable,
    `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true; CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE (ST_ReducePrecision("${column}", ${
      1 / Math.pow(10, decimals)
    })::${geoType} AS "${column}") FROM "${simpleTable.name}"`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "reducePrecision()",
      parameters: { column, decimals },
    }),
  );
}
