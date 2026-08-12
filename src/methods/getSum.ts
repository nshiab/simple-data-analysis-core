import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getSum(
  SimpleTable: SimpleTable,
  column: string,
) {
  const qualifiedColumn = quoteQualifiedIdentifier(SimpleTable.name, column);
  const queryResult = await queryDB(
    SimpleTable,
    `SELECT SUM(${qualifiedColumn}) AS ${quoteIdentifier(column)} FROM ${
      quoteIdentifier(SimpleTable.name)
    }`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnData: true,
      method: "getSum()",
      parameters: { column },
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const result = queryResult[0][column];

  return result as number;
}
