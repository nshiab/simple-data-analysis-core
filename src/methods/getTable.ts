import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import { recordCacheTableLookup } from "../helpers/cacheTableDependencies.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import formatMissingTables from "../helpers/formatMissingTables.ts";
import { registerTable } from "../helpers/tableRegistry.ts";

export default async function getTable<Table extends SimpleTable>(
  sdb: SimpleDB<Table>,
  name: string,
): Promise<Table> {
  await sdb.start();
  const normalizedName = foldIdentifier(name);
  const matchesName = (table: Table) => foldIdentifier(table.name) === normalizedName;
  let table = sdb.getTables().find(matchesName);

  if (table === undefined) {
    // Inspect the current catalog without flushing queued table operations.
    // A temporary relation can shadow the base table targeted by fluent writes.
    const result = await sdb.connection!.runAndReadAll(
      `SELECT CASE WHEN table_type = 'BASE TABLE' AND table_catalog <> 'temp' THEN table_name END
       FROM information_schema.tables
       WHERE ((table_catalog = current_database() AND table_schema = current_schema())
          OR (table_catalog = 'temp' AND table_schema = 'main'))
         AND translate(table_name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = $1
       ORDER BY (table_catalog = 'temp') DESC
       LIMIT 1`,
      [normalizedName],
    );
    const catalogName = result.getRowsJS()[0]?.[0];

    // Another lookup may have registered the table while the query ran.
    table = sdb.getTables().find(matchesName);
    if (table === undefined && typeof catalogName === "string") {
      table = new sdb.tableClass(catalogName, sdb, {
        rowsToLog: sdb.rowsToLog,
        charsToLog: sdb.charsToLog,
        typesToLog: sdb.typesToLog,
      });
      registerTable(sdb, table, "existing");
    }
  }

  if (table === undefined) {
    throw new Error(
      formatMissingTables(
        "getTable()",
        [name],
        sdb.getTables().map((table) => table.name),
      ),
    );
  }
  recordCacheTableLookup(table);
  return table;
}
