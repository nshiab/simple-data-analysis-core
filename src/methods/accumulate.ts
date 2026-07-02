import accumulateQuery from "../helpers/accumulateQuery.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function accumulate(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  await queryDB(
    simpleTable,
    accumulateQuery(simpleTable.name, column, newColumn, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "accumulate()",
      parameters: { column, newColumn, options },
    }),
  );
}
