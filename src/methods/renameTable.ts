import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import { markTableChanged } from "../helpers/tableGeneration.ts";

export default async function renameTable(
  simpleTable: SimpleTable,
  name: string,
) {
  await queryDB(
    simpleTable,
    `ALTER TABLE ${quoteIdentifier(simpleTable.name)} RENAME TO ${
      quoteIdentifier(name)
    };`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "renameTable()",
      parameters: { name },
    }),
  );
  markTableChanged(simpleTable);
}
