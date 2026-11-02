import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";

export default async function getUniques(simpleTable: SimpleTable, column: string | string[]) {
  const columns = [...new Set(stringToArray(column))];
  if (columns.length === 0) {
    throw new Error("getUniques() requires at least one column.");
  }
  const qualifiedColumns = columns.map((name) => quoteQualifiedIdentifier(simpleTable.name, name));
  const queryResult = await queryDB(
    simpleTable,
    `SELECT DISTINCT ${qualifiedColumns.join(", ")} FROM ${quoteIdentifier(
      simpleTable.name,
    )} ORDER BY ${qualifiedColumns.map((name) => `${name} ASC`).join(", ")}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getUniques()",
      parameters: { column },
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  return typeof column === "string" ? queryResult.map((d) => d[column]) : queryResult;
}
