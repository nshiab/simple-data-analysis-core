import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getStdDev(
  SimpleTable: SimpleTable,
  column: string,
  options: {
    decimals?: number;
  } = {},
) {
  const queryResult = await queryDB(
    SimpleTable,
    typeof options.decimals === "number"
      ? `SELECT ROUND(STDDEV(${
        quoteIdentifier(column)
      }), ${options.decimals}) AS ${quoteIdentifier(column)} FROM ${
        quoteIdentifier(SimpleTable.name)
      }`
      : `SELECT STDDEV(${quoteIdentifier(column)}) AS ${
        quoteIdentifier(column)
      } FROM ${quoteIdentifier(SimpleTable.name)}`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnData: true,
      method: "getStdDev()",
      parameters: { column, options },
    }),
  );

  if (!queryResult) {
    throw new Error("No queryResults");
  }

  const result = queryResult[0][column];
  return result as number;
}
