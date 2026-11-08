import type SimpleTable from "../class/SimpleTable.ts";

export default async function getExtent(
  simpleTable: SimpleTable,
  column: string,
  options: { decimals?: number } = {},
): Promise<[unknown, unknown]> {
  return [await simpleTable.getMin(column, options), await simpleTable.getMax(column, options)];
}
