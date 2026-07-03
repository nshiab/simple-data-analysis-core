import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function updateColumn(
  simpleTable: SimpleTable,
  column: string,
  definition: string,
) {
  await queryDB(
    simpleTable,
    `UPDATE "${simpleTable.name}" SET "${column}" = ${definition}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "updateColumn()",
      parameters: { column, definition },
    }),
  );
}
