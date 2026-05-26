import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getNbRows(
  SimpleTable: SimpleTable,
  options: { conditions?: string } = {},
) {
  const queryResult = await queryDB(
    SimpleTable,
    `SELECT CAST(COUNT(*) AS INTEGER) AS nbRows FROM "${SimpleTable.name}"${
      options.conditions ? ` WHERE ${options.conditions}` : ""
    }`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      returnDataFrom: "query",
      method: "getNbRows()",
      parameters: { options },
    }),
  );

  if (!queryResult) {
    throw new Error("No result");
  }
  const length = queryResult[0].nbRows as number;

  return length;
}
