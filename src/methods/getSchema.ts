import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getSchema(
  simpleTable: SimpleTable,
) {
  return (await queryDB(
    simpleTable,
    `DESCRIBE "${simpleTable.name}"`,
    mergeOptions(simpleTable, {
      returnDataFrom: "query",
      nbRowsToLog: Infinity,
      table: simpleTable.name,
      method: "getSchema()",
      parameters: {},
    }),
  )) as {
    [key: string]: string | null;
  }[];
}
