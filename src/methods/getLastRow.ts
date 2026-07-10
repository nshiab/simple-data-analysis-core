import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getLastRow(
  simpleTable: SimpleTable,
  options: {
    conditions?: string;
  } = {},
) {
  const queryResult = await queryDB(
    simpleTable,
    `WITH "numberedRowsForGetLastRow" AS (
                SELECT *, row_number() OVER () as "rowNumberForGetLastRow" FROM "${simpleTable.name}"${
      options.conditions ? ` WHERE ${options.conditions}` : ""
    }
            )
            SELECT * FROM "numberedRowsForGetLastRow" ORDER BY "rowNumberForGetLastRow" DESC LIMIT 1;`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      returnData: true,
      method: "getLastRow()",
      parameters: { options },
    }),
  );
  if (!queryResult) {
    throw new Error("No queryResult");
  }
  const result = queryResult[0];
  if (result === undefined) {
    return null;
  }
  delete result.rowNumberForGetLastRow;

  return result;
}
