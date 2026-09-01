import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import { retainRegisteredTables } from "../helpers/tableRegistry.ts";

export default async function removeTable(
  simpleTable: SimpleTable,
) {
  await queryDB(
    simpleTable,
    `DROP TABLE ${quoteIdentifier(simpleTable.name)};`,
    mergeOptions(simpleTable, {
      table: null,
      method: "removeTable()",
      parameters: {},
    }),
  );

  retainRegisteredTables(
    simpleTable.sdb,
    (table) => table.name !== simpleTable.name,
  );
}
