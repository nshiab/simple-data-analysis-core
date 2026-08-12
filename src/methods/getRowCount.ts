import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getRowCount(
  SimpleTable: SimpleTable,
  options: { conditions?: string } = {},
) {
  const queryResult = await queryDB(
    SimpleTable,
    `SELECT CAST(COUNT(*) AS INTEGER) AS count FROM ${
      quoteIdentifier(SimpleTable.name)
    }${options.conditions ? ` WHERE ${options.conditions}` : ""}`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnData: true,
      method: "getRowCount()",
      parameters: { options },
    }),
  );

  if (!queryResult) {
    throw new Error("No result");
  }
  const length = queryResult[0].count as number;

  return length;
}
