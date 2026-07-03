import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function inside(
  simpleTable: SimpleTable,
  column1: string,
  column2: string,
  newColumn: string,
) {
  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" BOOLEAN; UPDATE "${simpleTable.name}" SET "${newColumn}" = ST_Covers("${column2}", "${column1}")`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "inside()",
      parameters: { column1, column2, newColumn },
    }),
  );
}
