import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default async function getSchema(
  simpleTable: SimpleTable,
) {
  return (await queryDB(
    simpleTable,
    `DESCRIBE ${quoteIdentifier(simpleTable.name)}`,
    mergeOptions(simpleTable, {
      returnData: true,
      rowsToLog: Infinity,
      table: simpleTable.name,
      method: "getSchema()",
      parameters: {},
    }),
  )) as {
    [key: string]: string | null;
  }[];
}
