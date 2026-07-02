import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function intersect(
  simpleTable: SimpleTable,
  column1: string,
  column2: string,
  newColumn: string,
) {
  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" BOOLEAN; UPDATE "${simpleTable.name}" SET "${newColumn}" = ST_Intersects("${column1}", "${column2}")`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "intersect()",
      parameters: { column1, column2, newColumn },
    }),
  );
}
