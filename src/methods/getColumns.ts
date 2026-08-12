import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default async function getColumns(simpleTable: SimpleTable) {
  if (simpleTable.sdb.dataTransport === "file") {
    return Object.keys(await simpleTable.getTypes());
  }

  const queryResult = await queryDB(
    simpleTable,
    `DESCRIBE ${quoteIdentifier(simpleTable.name)}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getColumns()",
      parameters: {},
    }),
  );

  if (!queryResult) {
    throw new Error("The query did not return a result.");
  }

  const columns = queryResult.map((d) => d.column_name) as string[];

  return columns;
}
