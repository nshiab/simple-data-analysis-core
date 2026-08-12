import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getMean(
  simpleTable: SimpleTable,
  column: string,
  options: {
    decimals?: number;
  } = {},
) {
  const qualifiedColumn = quoteQualifiedIdentifier(simpleTable.name, column);
  const queryResult = await queryDB(
    simpleTable,
    typeof options.decimals === "number"
      ? `SELECT ROUND(AVG(${qualifiedColumn}), ${options.decimals}) AS ${
        quoteIdentifier(column)
      } FROM ${quoteIdentifier(simpleTable.name)}`
      : `SELECT AVG(${qualifiedColumn}) AS ${quoteIdentifier(column)} FROM ${
        quoteIdentifier(simpleTable.name)
      }`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getMean()",
      parameters: { column, options },
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const result = queryResult[0][column];

  return result as number;
}
