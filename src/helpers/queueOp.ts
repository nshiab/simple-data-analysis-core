import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { PendingOpInput } from "./pendingOps.ts";
import { ensureTableRegistered, getRegisteredTables } from "./tableRegistry.ts";
import { markTableChanged } from "./tableGeneration.ts";
import { recordCacheTableReferences } from "./cacheTableDependencies.ts";
import { captureAsyncOperation } from "./asyncOperationContext.ts";

/**
 * Queues a synchronous table-builder operation or a barrier.
 * Operations execute lazily at the next observation point in database-wide
 * program order. Builder operations queued by an `asyncBarrier` callback are
 * drained before the callback's observer queries and before later chained
 * operations.
 *
 * Asynchronous barrier callbacks must await all work that can queue table
 * operations. Detached work is outside the barrier's program-order scope.
 *
 * @param simpleTable - The table whose chain owns the operation.
 * @param op - The fusable operation or asynchronous barrier to queue.
 * @returns Nothing. Public builder methods should return their target table.
 *
 * @example
 * ```ts
 * import type { SimpleTable } from "@nshiab/simple-data-analysis-core";
 * import { queueOp } from "@nshiab/simple-data-analysis-core/helpers";
 *
 * function loadRemote(table: SimpleTable, url: string): void {
 *   queueOp(table, {
 *     kind: "asyncBarrier",
 *     method: "loadRemote()",
 *     parameters: { url },
 *     execute: async () => {
 *       const rows = await fetch(url).then((response) => response.json()) as
 *         { [key: string]: unknown }[];
 *       table.loadArray(rows);
 *     },
 *   });
 * }
 * ```
 */
export default function queueOp(
  simpleTable: SimpleTable,
  op:
    | {
      kind: "fusable";
      method: string;
      parameters: { [key: string]: unknown } | null;
      needsSchema: boolean;
      needsSpatial?: boolean;
      rawSQL?: string[];
      values?:
        | import("@duckdb/node-api").DuckDBValue[]
        | (
          (
            schema: import("./pendingOps.ts").TableSchema,
          ) => import("@duckdb/node-api").DuckDBValue[]
        );
      preservesSchema?: boolean;
      buildSelect: (
        input: string,
        schema: import("./pendingOps.ts").TableSchema,
      ) => string;
    }
    | {
      kind: "barrier";
      method: string;
      parameters: { [key: string]: unknown } | null;
      execute: () => Promise<void>;
    }
    | {
      kind: "asyncBarrier";
      method: string;
      parameters: { [key: string]: unknown } | null;
      execute: () => Promise<void>;
    },
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
