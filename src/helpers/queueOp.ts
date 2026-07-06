import type SimpleTable from "../class/SimpleTable.ts";
import type { PendingOpInput } from "./pendingOps.ts";

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
  simpleTable.pendingOps.push({
    ...op,
    sequence: simpleTable.sdb.opSequence++,
  });
}
