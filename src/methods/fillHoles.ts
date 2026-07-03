import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function fillHoles(
  simpleTable: SimpleTable,
  column?: string,
) {
  const col = column ?? (await findGeoColumn(simpleTable));
  await queryDB(
    simpleTable,
    `UPDATE "${simpleTable.name}" SET geom = ST_MakePolygon(ST_ExteriorRing("${col}"));`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "fillHoles()",
      parameters: { column },
    }),
  );
}
