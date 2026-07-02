import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function simplify(
  simpleTable: SimpleTable,
  tolerance: number,
  options: { column?: string; simplifyBoundary?: boolean } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  await simpleTable.addRowNumber("rowNumberForSimplify");

  const geoType = await simpleTable.getProjection(column);

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * REPLACE(ST_CoverageSimplify(ARRAY_AGG("${column}"), ${tolerance}${
      options.simplifyBoundary === false ? ", FAlSE" : ""
    })::${geoType} AS "${column}") FROM "${simpleTable.name}" GROUP BY ALL;`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "simplify()",
      parameters: { column, tolerance },
    }),
  );

  await simpleTable.removeColumns("rowNumberForSimplify");
}
