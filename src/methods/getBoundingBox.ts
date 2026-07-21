import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getBoundingBox(
  simpleTable: SimpleTable,
  column?: string,
): Promise<[number, number, number, number]> {
  const col = column ?? (await findGeoColumn(simpleTable));
  const result = (await queryDB(
    simpleTable,
    `SELECT
                MIN(ST_YMin(${quoteIdentifier(col)})) AS minX,
                MIN(ST_XMin(${quoteIdentifier(col)})) AS minY,
                MAX(ST_YMax(${quoteIdentifier(col)})) AS maxX,
                MAX(ST_XMax(${quoteIdentifier(col)})) AS maxY,
            from ${quoteIdentifier(simpleTable.name)};`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "getBoundingBox()",
      parameters: { column },
      returnData: true,
    }),
  )) as { minX: number; minY: number; maxX: number; maxY: number }[];
  return [result[0].minY, result[0].minX, result[0].maxY, result[0].maxX];
}
