import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getQuantile(
  SimpleTable: SimpleTable,
  column: string,
  quantile: number,
  options: {
    decimals?: number;
  } = {},
) {
  const qualifiedColumn = quoteQualifiedIdentifier(SimpleTable.name, column);
  const queryResult = await queryDB(
    SimpleTable,
    typeof options.decimals === "number"
      ? `SELECT ROUND(QUANTILE_CONT(${qualifiedColumn}, ${quantile}), ${options.decimals}) AS ${
        quoteIdentifier(column)
      } FROM ${quoteIdentifier(SimpleTable.name)}`
      : `SELECT QUANTILE_CONT(${qualifiedColumn}, ${quantile}) AS ${
        quoteIdentifier(column)
      } FROM ${quoteIdentifier(SimpleTable.name)}`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnData: true,
      method: "getQuantile()",
      parameters: { column, quantile, options },
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const result = queryResult[0][column];
  return result as number;
}
