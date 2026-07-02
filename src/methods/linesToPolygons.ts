import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function linesToPolygons(
  simpleTable: SimpleTable,
  column?: string,
) {
  const col = column ?? (await findGeoColumn(simpleTable));

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE("${col}"), ST_MakePolygon("${col}") as "${col}" FROM "${simpleTable.name}";`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "linesToPolygons()",
      parameters: { column },
    }),
  );
}
