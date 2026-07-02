import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import repeatRowsQuery from "../helpers/repeatRowsQuery.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function repeatRows(
  simpleTable: SimpleTable,
  column: string,
  options: { index?: string } = {},
) {
  await queryDB(
    simpleTable,
    repeatRowsQuery(simpleTable.name, column, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "repeatRows()",
      parameters: { column, options },
    }),
  );
}
