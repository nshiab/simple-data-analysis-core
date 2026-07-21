import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getMean(
  simpleTable: SimpleTable,
  column: string,
  options: {
    decimals?: number;
  } = {},
) {
  const queryResult = await queryDB(
    simpleTable,
    typeof options.decimals === "number"
      ? `SELECT ROUND(AVG(${
        quoteIdentifier(column)
      }), ${options.decimals}) AS ${quoteIdentifier(column)} FROM ${
        quoteIdentifier(simpleTable.name)
      }`
      : `SELECT AVG(${quoteIdentifier(column)}) AS ${
        quoteIdentifier(column)
      } FROM ${quoteIdentifier(simpleTable.name)}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getMean()",
      parameters: { column, options },
    }),
  );

  if (!queryResult) {
    throw new Error("No queryResults");
  }

  const result = queryResult[0][column];

  return result as number;
}
