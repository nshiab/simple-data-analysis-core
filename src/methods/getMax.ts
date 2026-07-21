import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getMax(
  simpleTable: SimpleTable,
  column: string,
) {
  const queryResult = await queryDB(
    simpleTable,
    `SELECT MAX(${quoteIdentifier(column)}) AS ${
      quoteIdentifier(column)
    } FROM ${quoteIdentifier(simpleTable.name)}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getMax()",
      parameters: { column },
    }),
  );

  if (!queryResult) {
    throw new Error("No queryResults");
  }

  const result = queryResult[0][column];

  return result;
}
