import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import quoteQualifiedIdentifier from "../helpers/quoteQualifiedIdentifier.ts";

export default async function getValues(
  simpleTable: SimpleTable,
  column: string,
) {
  const queryResult = await queryDB(
    simpleTable,
    `SELECT ${quoteQualifiedIdentifier(simpleTable.name, column)} FROM ${
      quoteIdentifier(simpleTable.name)
    }`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getValues()",
      parameters: { column },
    }),
  );
  if (!queryResult) {
    throw new Error("No result");
  }

  const values = queryResult.map((d) => d[column]);

  return values;
}
