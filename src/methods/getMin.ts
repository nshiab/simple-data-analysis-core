import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getMin(
  simpleTable: SimpleTable,
  column: string,
) {
  const qualifiedColumn = quoteQualifiedIdentifier(simpleTable.name, column);
  const queryResult = await queryDB(
    simpleTable,
    `SELECT MIN(${qualifiedColumn}) AS ${quoteIdentifier(column)} FROM ${
      quoteIdentifier(simpleTable.name)
    }`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getMin()",
      parameters: { column },
    }),
  );

  if (!queryResult) {
    throw new Error("No queryResults");
  }
  const result = queryResult[0][column];

  return result;
}
