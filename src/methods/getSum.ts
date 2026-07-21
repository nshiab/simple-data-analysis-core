import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getSum(
  SimpleTable: SimpleTable,
  column: string,
) {
  const queryResult = await queryDB(
    SimpleTable,
    `SELECT SUM(${quoteIdentifier(column)}) AS ${
      quoteIdentifier(column)
    } FROM ${quoteIdentifier(SimpleTable.name)}`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnData: true,
      method: "getSum()",
      parameters: { column },
    }),
  );

  if (!queryResult) {
    throw new Error("No queryResults");
  }

  const result = queryResult[0][column];

  return result as number;
}
