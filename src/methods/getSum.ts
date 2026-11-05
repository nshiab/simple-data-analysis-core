import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getSum(
  simpleTable: SimpleTable,
  column: string,
  options: { decimals?: number } = {},
) {
  const qualifiedColumn = quoteQualifiedIdentifier(simpleTable.name, column);
  const sum = `SUM(${qualifiedColumn})`;
  const expression =
    typeof options.decimals === "number" ? `ROUND(${sum}, ${options.decimals})` : sum;
  const queryResult = await queryDB(
    simpleTable,
    `SELECT ${expression} AS ${quoteIdentifier(column)} FROM ${quoteIdentifier(simpleTable.name)}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getSum()",
      parameters: { column, options },
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const result = queryResult[0][column];

  return result as number;
}
