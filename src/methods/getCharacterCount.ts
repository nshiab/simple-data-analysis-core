import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getCharacterCount(
  SimpleTable: SimpleTable,
  column: string,
) {
  const queryResult = await queryDB(
    SimpleTable,
    `SELECT CAST(SUM(LENGTH(${
      quoteQualifiedIdentifier(SimpleTable.name, column)
    })) AS BIGINT) AS total_chars FROM ${quoteIdentifier(SimpleTable.name)}`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnData: true,
      method: "getCharacterCount()",
      parameters: { column },
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const result = Number(queryResult[0].total_chars);

  return result;
}
