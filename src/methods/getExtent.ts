import readRoundedExtrema from "../helpers/readRoundedExtrema.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getExtent(
  simpleTable: SimpleTable,
  column: string,
  options: { decimals?: number } = {},
): Promise<[unknown, unknown]> {
  const { decimals } = options;
  if (decimals === undefined) {
    return [await simpleTable.getMin(column), await simpleTable.getMax(column)];
  }
  const [min, max] = await readRoundedExtrema(simpleTable, column, decimals, "getExtent()", [
    "MIN",
    "MAX",
  ]);
  return [min, max];
}
