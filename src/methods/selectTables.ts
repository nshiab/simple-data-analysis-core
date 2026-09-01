import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import SimpleTable from "../class/SimpleTable.ts";
import type SimpleDB from "../class/SimpleDB.ts";
import { retainRegisteredTables } from "../helpers/tableRegistry.ts";
import assertSameDatabase from "../helpers/assertSameDatabase.ts";
import formatMissingTables from "../helpers/formatMissingTables.ts";

export default async function selectTables(
  simpleDB: SimpleDB,
  tables: SimpleTable | string | (SimpleTable | string)[],
) {
  const selected = Array.isArray(tables) ? tables : [tables];
  assertSameDatabase(
    simpleDB,
    selected.filter((table): table is SimpleTable =>
      table instanceof SimpleTable
    ),
    "selectTables()",
  );
  const tablesToBeSelected = selected.map((
    t,
  ) => t instanceof SimpleTable ? t.name : t);

  const existingTables = await simpleDB.getTableNames();
  const missingTables = tablesToBeSelected.filter((table) =>
    !existingTables.includes(table)
  );
  if (missingTables.length > 0) {
    throw new Error(
      formatMissingTables("selectTables()", missingTables, existingTables),
    );
  }

  const tablesToBeRemoved = simpleDB.getTables().filter((t) =>
    !tablesToBeSelected.includes(t.name)
  );

  await queryDB(
    simpleDB,
    tablesToBeRemoved.map((d) =>
      `DROP TABLE ${quoteIdentifier(d instanceof SimpleTable ? d.name : d)};`
    ).join("\n"),
    mergeOptions(simpleDB, {
      table: null,
      method: "removeTable()",
      parameters: {},
    }),
  );

  const tablesNamesToBeRemoved = tablesToBeRemoved.map((t) =>
    t instanceof SimpleTable ? t.name : t
  );
  retainRegisteredTables(
    simpleDB,
    (table) => !tablesNamesToBeRemoved.includes(table.name),
  );
}
