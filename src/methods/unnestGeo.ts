import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function unnestGeo(
  simpleTable: SimpleTable,
  column?: string,
) {
  const col = column ?? (await findGeoColumn(simpleTable));
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE("${col}"), UNNEST(ST_Dump("${col}"), recursive := TRUE) FROM "${simpleTable.name}"; ALTER TABLE "${simpleTable.name}" DROP COLUMN path;`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "unnestGeo()",
      parameters: { column },
    }),
  );
}
