import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function truncate(
  simpleTable: SimpleTable,
  column: string,
  length: number,
) {
  await queryDB(
    simpleTable,
    truncateQuery(simpleTable.name, column, length),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "truncate()",
      parameters: { column, length },
    }),
  );
}

function truncateQuery(
  table: string,
  column: string,
  length: number,
) {
  return `UPDATE "${table}" SET "${column}" = LEFT("${column}", ${length});`;
}
