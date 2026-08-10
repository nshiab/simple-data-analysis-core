import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getUniques(
  simpleTable: SimpleTable,
  column: string,
) {
  const qualifiedColumn = quoteQualifiedIdentifier(simpleTable.name, column);
  const queryResult = await queryDB(
    simpleTable,
    `SELECT DISTINCT ${qualifiedColumn} FROM ${
      quoteIdentifier(simpleTable.name)
    } ORDER BY ${qualifiedColumn} ASC`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getUniques()",
      parameters: { column },
    }),
  );

  if (!queryResult) {
    throw new Error("No result.");
  }

  const uniques = queryResult.map((d) => d[column]);

  return uniques;
}
