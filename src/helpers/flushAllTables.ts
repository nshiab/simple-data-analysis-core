import type SimpleDB from "../class/SimpleDB.ts";
import flushTable from "./flushTable.ts";

/**
 * Executes the pending chains of all tables in the database, in table
 * creation order. Every query execution point goes through this (via
 * queryDB), so program order is preserved: anything queued before the
 * current query runs first, like immediate execution would.
 *
 * The `flushing` flag prevents the queries run by the flush itself from
 * triggering a new flush.
 */
export default async function flushAllTables(sdb: SimpleDB): Promise<void> {
  if (sdb.flushing) {
    return;
  }
  sdb.flushing = true;
  try {
    for (const table of [...sdb.tables]) {
      await flushTable(table);
    }
  } finally {
    sdb.flushing = false;
  }
}
