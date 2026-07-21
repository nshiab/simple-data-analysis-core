import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getQuantile(
  SimpleTable: SimpleTable,
  column: string,
  quantile: number,
  options: {
    decimals?: number;
  } = {},
) {
  const queryResult = await queryDB(
    SimpleTable,
    typeof options.decimals === "number"
      ? `SELECT ROUND(QUANTILE_CONT(${
        quoteIdentifier(column)
      }, ${quantile}), ${options.decimals}) AS ${
        quoteIdentifier(column)
      } FROM ${quoteIdentifier(SimpleTable.name)}`
      : `SELECT QUANTILE_CONT(${quoteIdentifier(column)}, ${quantile}) AS ${
        quoteIdentifier(column)
      } FROM ${quoteIdentifier(SimpleTable.name)}`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnData: true,
      method: "getQuantile()",
      parameters: { column, quantile, options },
    }),
  );

  if (!queryResult) {
    throw new Error("No queryResults");
  }

  const result = queryResult[0][column];
  return result as number;
}
