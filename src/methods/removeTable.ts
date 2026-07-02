import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function removeTable(
  simpleTable: SimpleTable,
) {
  await queryDB(
    simpleTable,
    `DROP TABLE "${simpleTable.name}";`,
    mergeOptions(simpleTable, {
      table: null,
      method: "removeTable()",
      parameters: {},
    }),
  );

  simpleTable.sdb.tables = simpleTable.sdb.tables.filter(
    (t) => t.name !== simpleTable.name,
  );
}
