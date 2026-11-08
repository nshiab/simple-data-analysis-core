import roundExpression from "../helpers/roundExpression.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getMin(
  simpleTable: SimpleTable,
  column: string,
  options: { decimals?: number } = {},
) {
  const qualifiedColumn = quoteQualifiedIdentifier(simpleTable.name, column);
  const type =
    options.decimals === undefined
      ? undefined
      : Object.entries(await simpleTable.getTypes()).find(
          ([name]) => foldIdentifier(name) === foldIdentifier(column),
        )?.[1];
  const expression = roundExpression(`MIN(${qualifiedColumn})`, options.decimals, type);
  const queryResult = await queryDB(
    simpleTable,
    `SELECT ${expression} AS ${quoteIdentifier(column)} FROM ${quoteIdentifier(simpleTable.name)}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getMin()",
      parameters: { column, options },
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }
  const result = queryResult[0][column];

  return result;
}
