import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getFirstRow(
  simpleTable: SimpleTable,
  options: {
    conditions?: string;
  } = {},
) {
  const queryResult = await queryDB(
    simpleTable,
    `SELECT * FROM ${quoteIdentifier(simpleTable.name)}${
      options.conditions ? ` WHERE ${options.conditions}` : ""
    } LIMIT 1`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getFirstRow()",
      parameters: { options },
    }),
  );
  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const result = queryResult[0];

  return result ?? null;
}
