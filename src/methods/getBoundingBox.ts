import roundExpression from "../helpers/roundExpression.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getBoundingBox(
  simpleTable: SimpleTable,
  column?: string,
  options: { decimals?: number } = {},
): Promise<[number, number, number, number]> {
  const col = column ?? (await findGeoColumn(simpleTable, "getBoundingBox()"));
  const result = (await queryDB(
    simpleTable,
    `SELECT
                ${roundExpression(`MIN(ST_YMin(${quoteIdentifier(col)}))`, options.decimals)} AS minX,
                ${roundExpression(`MIN(ST_XMin(${quoteIdentifier(col)}))`, options.decimals)} AS minY,
                ${roundExpression(`MAX(ST_YMax(${quoteIdentifier(col)}))`, options.decimals)} AS maxX,
                ${roundExpression(`MAX(ST_XMax(${quoteIdentifier(col)}))`, options.decimals)} AS maxY,
            from ${quoteIdentifier(simpleTable.name)};`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "getBoundingBox()",
      parameters: { column, options },
      returnData: true,
    }),
  )) as { minX: number; minY: number; maxX: number; maxY: number }[];
  return [result[0].minY, result[0].minX, result[0].maxY, result[0].maxX];
}
