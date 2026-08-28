import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { PendingOpInput } from "./pendingOps.ts";
import { ensureTableRegistered, getRegisteredTables } from "./tableRegistry.ts";
import { markTableChanged } from "./tableGeneration.ts";
import { recordCacheTableReferences } from "./cacheTableDependencies.ts";
import { captureAsyncOperation } from "./asyncOperationContext.ts";

/**
 * Queues an internal fusable operation, barrier, or asynchronous barrier.
 *
 * @internal
 */
export default function queueOp(
  simpleTable: SimpleTable,
  op: PendingOpInput,
): void {
  const sdb = simpleTable.sdb;
  if (sdb.lifecycleState !== "open") {
    throw new Error(
      `${op.method} cannot queue work because its SimpleDB is ${sdb.lifecycleState}.`,
    );
  }
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
    if (capturedOp.rawSQL !== undefined) {
      recordCacheTableReferences(simpleTable, capturedOp.rawSQL);
    }
  } else if (capturedOp.kind === "source") {
    capturedOp = {
      ...capturedOp,
      rawSQL: capturedOp.rawSQL === undefined
        ? undefined
        : [...capturedOp.rawSQL],
      values: capturedOp.values === undefined
        ? undefined
        : [...capturedOp.values],
    };
    if (capturedOp.rawSQL !== undefined) {
      recordCacheTableReferences(simpleTable, capturedOp.rawSQL);
    }
  }
  // A table de-registered by removeTable()/removeTables()/selectTables() that
  // queues new work comes back under the flush's responsibility, like v1
  // methods recreating a removed table.
  ensureTableRegistered(sdb, simpleTable);
  markTableChanged(simpleTable);
  const queuedOp = {
    ...capturedOp,
    sequence: sdb.opSequence++,
  };
  if (captureAsyncOperation(sdb, { table: simpleTable, op: queuedOp })) {
    return;
  }
  simpleTable.pendingOps.push(queuedOp);
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
