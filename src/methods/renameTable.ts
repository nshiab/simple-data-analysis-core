import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function renameTable(
  simpleTable: SimpleTable,
  name: string,
) {
  await queryDB(
    simpleTable,
    `ALTER TABLE "${simpleTable.name}" RENAME TO "${name}";`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "renameTable()",
      parameters: { name },
    }),
  );

  simpleTable.name = name;
}
