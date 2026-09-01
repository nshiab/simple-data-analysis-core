import type SimpleTable from "../class/SimpleTable.ts";
import queueOp from "./queueOp.ts";

/**
 * Queues asynchronous extension work as one ordered table-builder step.
 * Builder operations queued by `execute` are scoped to the barrier and drain
 * before its observer queries and before later chained operations.
 *
 * `execute` must await all asynchronous work that can queue table operations.
 * Detached work is outside the barrier's program-order scope.
 *
 * If `execute` rejects, captured builder operations that have not already
 * drained are discarded. Operations drained by an observer inside `execute`
 * remain applied; an asynchronous barrier does not provide database rollback.
 *
 * @param simpleTable - The table whose chain owns the asynchronous work.
 * @param operation - The asynchronous extension operation to queue.
 * @param operation.method - The public method name used for diagnostics.
 * @param operation.parameters - A snapshot of the public method parameters used for diagnostics.
 * @param operation.execute - The asynchronous work to run at the barrier's position in the chain.
 * @returns Nothing. The public builder should return its target table.
 *
 * @example
 * ```ts
 * import type { SimpleTable } from "@nshiab/simple-data-analysis-core";
 * import { queueAsyncBarrier } from "@nshiab/simple-data-analysis-core/helpers";
 *
 * function loadRemote(table: SimpleTable, url: string): SimpleTable {
 *   queueAsyncBarrier(table, {
 *     method: "loadRemote()",
 *     parameters: { url },
 *     execute: async () => {
 *       const rows = await fetch(url).then((response) => response.json()) as
 *         { [key: string]: unknown }[];
 *       table.loadArray(rows);
 *     },
 *   });
 *   return table;
 * }
 * ```
 */
export default function queueAsyncBarrier(
  simpleTable: SimpleTable,
  operation: {
    method: string;
    parameters: { [key: string]: unknown } | null;
    execute: () => Promise<void>;
  },
): void {
  queueOp(simpleTable, {
    kind: "asyncBarrier",
    ...operation,
  });
}
