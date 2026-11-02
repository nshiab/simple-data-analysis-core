import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import getUniquesQuery from "./getUniquesQuery.ts";

export default async function getUniques(simpleTable: SimpleTable, column: string | string[]) {
  const queryResult = await queryDB(
    simpleTable,
    getUniquesQuery(simpleTable, column),
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
