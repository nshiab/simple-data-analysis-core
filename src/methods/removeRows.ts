import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function removeRows(
  simpleTable: SimpleTable,
  conditions: string,
) {
  await queryDB(
    simpleTable,
    `DELETE FROM "${simpleTable.name}" WHERE ${conditions}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "removeRows()",
      parameters: { conditions },
    }),
  );
}
