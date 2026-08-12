import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { PendingOpInput } from "./pendingOps.ts";
import { ensureTableRegistered, getRegisteredTables } from "./tableRegistry.ts";

/**
 * Queues an operation on a table, stamping it with a database-wide sequence
 * number. The flush replays operations across all tables in sequence order,
 * so interleaved operations on different tables execute exactly in the order
 * the user queued them, like immediate execution would.
 */
export default function queueOp(
  simpleTable: SimpleTable,
  op: PendingOpInput,
): void {
  const sdb = simpleTable.sdb;
  let capturedOp: PendingOpInput = {
    ...op,
    parameters: op.parameters === null ? null : structuredClone(op.parameters),
  };
  if (capturedOp.kind === "fusable") {
    capturedOp = {
      ...capturedOp,
      rawSQL: capturedOp.rawSQL === undefined
        ? undefined
        : [...capturedOp.rawSQL],
      values: capturedOp.values === undefined
        ? undefined
        : typeof capturedOp.values === "function"
        ? capturedOp.values
        : [...capturedOp.values],
    };
  }
  // A table de-registered by removeTable()/removeTables()/selectTables() that
  // queues new work comes back under the flush's responsibility, like v1
  // methods recreating a removed table.
  ensureTableRegistered(sdb, simpleTable);
  simpleTable.pendingOps.push({
    ...capturedOp,
    sequence: sdb.opSequence++,
  });
  sdb.pendingCount++;
}

/**
 * Empties every table's pending queue without executing it and returns what
 * was dropped, so close() can report forgotten work after cleaning up.
 */
export function discardAllPending(
  sdb: SimpleDB,
): { table: SimpleTable; methods: string[] }[] {
  const discarded: { table: SimpleTable; methods: string[] }[] = [];
  for (const table of getRegisteredTables(sdb)) {
    if (table.pendingOps.length > 0) {
      discarded.push({
        table,
        methods: table.pendingOps.map((op) => op.method),
      });
      sdb.pendingCount -= table.pendingOps.length;
      table.pendingOps.length = 0;
    }
  }
  return discarded;
}
