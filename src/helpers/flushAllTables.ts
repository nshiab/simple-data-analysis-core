import { AsyncLocalStorage } from "node:async_hooks";
import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type {
  FusableOp,
  PendingOp,
  RelationalOp,
  TableSchema,
} from "./pendingOps.ts";
import cleanSQL from "./cleanSQL.ts";
import ensureSpatial from "./ensureSpatial.ts";
import extractTypes from "./extractTypes.ts";
import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import { getRegisteredTables } from "./tableRegistry.ts";
import {
  type AsyncOperationFrame,
  getAsyncOperationFrame,
  isDrainingAsyncOperationFrame,
  type PendingEntry,
  runWhileDrainingAsyncOperationFrame,
  runWithAsyncOperationFrame,
} from "./asyncOperationContext.ts";

/**
 * The databases whose flush is executing on the current async call chain.
 * Queries issued by the flush itself (fused statements, barriers, DESCRIBE)
 * re-enter flushAllTables through queryDB and must not trigger a new flush,
 * while queries from concurrent observers must wait for the in-flight flush
 * instead of reading mid-flush state.
 */
const flushContext = new AsyncLocalStorage<Set<SimpleDB>>();

/**
 * Runs `fn` with `sdb` exempt from the top-level flush. Queries issued by an
 * asynchronous barrier can still drain operations queued inside that barrier.
 * Used by the flush itself and by connection setup, whose queries must run
 * before any queued operation.
 */
export function runExemptFromFlush<T>(
  sdb: SimpleDB,
  fn: () => Promise<T>,
): Promise<T> {
  const exempt = new Set(flushContext.getStore());
  exempt.add(sdb);
  return flushContext.run(exempt, fn);
}

/**
 * Executes the pending operations of all tables in program order: every
 * queued operation carries a database-wide sequence number, so operations
 * on different tables replay exactly in the order the user queued them,
 * like immediate execution would. Consecutive fusable operations on the
 * same table compose as CTEs into a single statement; barriers execute
 * in order between fused segments.
 *
 * Every query execution point goes through this (via queryDB). Only one
 * flush runs at a time: concurrent observers wait for the in-flight flush,
 * then flush whatever queued in the meantime, so an awaited observer always
 * answers from fully executed state.
 */
export default async function flushAllTables(sdb: SimpleDB): Promise<void> {
  const frame = getAsyncOperationFrame(sdb);
  if (frame !== undefined) {
    if (!isDrainingAsyncOperationFrame(frame)) {
      await drainAsyncOperationFrame(frame);
    }
    return;
  }
  if (flushContext.getStore()?.has(sdb)) {
    // A query issued by the top-level flush itself.
    return;
  }
  while (sdb.flushPromise !== null) {
    // Another observer's flush is running: wait for it instead of reading
    // mid-flush state, then flush anything queued in the meantime.
    try {
      await sdb.flushPromise;
    } catch {
      // The error belongs to the observer that started that flush; this
      // observer only cares that the flush is over.
    }
  }
  if (sdb.pendingCount === 0) {
    return;
  }
  const promise = runExemptFromFlush(sdb, () => flush(sdb));
  sdb.flushPromise = promise;
  try {
    await promise;
  } finally {
    sdb.flushPromise = null;
  }
}

/**
 * An open run of consecutive fusable operations on one table, accumulated
 * while the flush walks the program-order replay. A segment closes when the
 * replay moves to another table, reaches a barrier or dependency through
 * user-supplied SQL, or reaches the end. Keeping only contiguous operations
 * together preserves database-wide failure order.
 */
type Segment = {
  table: SimpleTable;
  ops: RelationalOp[];
};

type CompiledCte = {
  alias: string;
  select: string;
  values: import("@duckdb/node-api").DuckDBValue[];
};

async function flush(sdb: SimpleDB): Promise<void> {
  // Take ownership of every queue upfront, in program order.
  const entries: PendingEntry[] = [];
  for (const table of getRegisteredTables(sdb)) {
    for (const op of table.pendingOps.splice(0, table.pendingOps.length)) {
      entries.push({ table, op });
    }
  }
  sdb.pendingCount = 0;
  await replayEntries(sdb, entries);
}

async function replayEntries(
  sdb: SimpleDB,
  pendingEntries: PendingEntry[],
): Promise<void> {
  const entries: (PendingEntry | null)[] = [...pendingEntries].sort((a, b) =>
    a.op.sequence - b.op.sequence
  );

  let open: Segment | null = null;
  // The table whose operation is executing, for error attribution: on
  // failure, that table's chain aborts and the other tables' pending work
  // goes back to their queues.
  let executing: SimpleTable | null = null;
  // The entry being dispatched, if it is neither executed nor part of an
  // open segment yet.
  let current: { table: SimpleTable; op: PendingOp } | null = null;

  const runOpenSegment = async () => {
    if (open === null) {
      return;
    }
    const segment = open;
    open = null;
    executing = segment.table;
    await runSegment(segment.table, segment.ops);
    executing = null;
  };

  let index = 0;
  try {
    for (; index < entries.length; index++) {
      const entry = entries[index]!;
      // Release the reference: a consumed operation (and whatever its
      // closures capture, like loadArray data) must not stay alive for the
      // rest of the flush.
      entries[index] = null;
      current = entry;
      const { table, op } = entry;

      if (open !== null && open.table !== table) {
        await runOpenSegment();
      }

      if (op.kind === "barrier") {
        // A barrier is multi-statement by nature and can read or write any
        // table, so everything pending executes first.
        await runOpenSegment();
        executing = table;
        await op.execute();
        executing = null;
        current = null;
        continue;
      }

      if (op.kind === "asyncBarrier") {
        // An asynchronous extension barrier also captures and drains builder
        // operations queued by its callback before replay continues.
        await runOpenSegment();
        executing = table;
        await runAsyncBarrier(table, op);
        executing = null;
        current = null;
        continue;
      }

      const reads = op.rawSQL === undefined
        ? []
        : referencedTables(op.rawSQL, sdb);

      if (reads.includes(table)) {
        // User-supplied SQL referencing the operation's own table must read
        // the state produced by the previous steps, which a fused chain
        // can't provide (the name would resolve to the pre-chain table). So
        // the chain materializes and the operation runs on its own.
        await runOpenSegment();
        executing = table;
        await runStepwise(table, op);
        executing = null;
        current = null;
        continue;
      }

      if (
        op.kind === "fusable" &&
        op.requiresMaterializedInput &&
        open?.ops[0]?.kind === "source"
      ) {
        // Materialize the source-rooted segment before this operation, then
        // let the operation begin a fresh segment so later transforms can
        // still fuse with it.
        await runOpenSegment();
        open = { table, ops: [op] };
        current = null;
        continue;
      }

      if (op.kind === "source") {
        // A source replaces the target table from an external relation. It
        // starts a new segment rather than consuming any segment already open
        // on the same table.
        await runOpenSegment();
        open = { table, ops: [op] };
        current = null;
        continue;
      }

      if (open === null) {
        open = { table, ops: [] };
      }
      open.ops.push(op);
      current = null;
    }
    await runOpenSegment();
  } catch (error) {
    // The failing table's chain aborts, like a v1 script stopping at the
    // failing line. The other tables' pending work was queued successfully
    // and goes back to their queues, to execute at their next observation.
    const failing = executing;
    const requeue = (table: SimpleTable, op: PendingOp) => {
      if (table !== failing) {
        table.pendingOps.push(op);
        sdb.pendingCount++;
      }
    };
    if (current !== null) {
      requeue(current.table, current.op);
    }
    if (open !== null) {
      for (const op of open.ops) {
        requeue(open.table, op);
      }
    }
    for (let i = index + 1; i < entries.length; i++) {
      const entry = entries[i];
      if (entry !== null) {
        requeue(entry.table, entry.op);
      }
    }
    throw error;
  }
}

async function runAsyncBarrier(
  table: SimpleTable,
  op: Extract<PendingOp, { kind: "asyncBarrier" }>,
): Promise<void> {
  await runWithAsyncOperationFrame(table.sdb, async (frame) => {
    await op.execute();
    await drainAsyncOperationFrame(frame);
  });
}

async function drainAsyncOperationFrame(
  frame: AsyncOperationFrame,
): Promise<void> {
  while (frame.drainPromise !== null) {
    try {
      await frame.drainPromise;
    } catch {
      // The observer that started the drain receives its failure. A concurrent
      // observer waits for that drain to finish, then handles remaining work.
    }
  }
  if (frame.entries.length === 0) {
    return;
  }

  // Start on the next microtask so drainPromise is visible before replay can
  // re-enter user code or another observer can attempt the same drain.
  const promise = Promise.resolve().then(() =>
    runWhileDrainingAsyncOperationFrame(frame, async () => {
      while (frame.entries.length > 0) {
        const entries = frame.entries.splice(0, frame.entries.length);
        await replayEntries(frame.sdb, entries);
      }
    })
  );
  frame.drainPromise = promise;
  try {
    await promise;
  } finally {
    if (frame.drainPromise === promise) {
      frame.drainPromise = null;
    }
  }
}

/**
 * Returns the tables of the database whose names appear in the given SQL
 * fragments. Matching is conservative (a column sharing a table's name
 * counts as a reference): a false positive only costs fusion, never
 * correctness.
 */
function referencedTables(rawSQL: string[], sdb: SimpleDB): SimpleTable[] {
  const referenced: SimpleTable[] = [];
  for (const table of getRegisteredTables(sdb)) {
    const escaped = table.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?<![\\w"])"?${escaped}"?(?![\\w"])`,
      "i",
    );
    if (rawSQL.some((sql) => pattern.test(sql))) {
      referenced.push(table);
    }
  }
  return referenced;
}

async function runSegment(
  table: SimpleTable,
  ops: RelationalOp[],
): Promise<void> {
  if (ops.length === 1) {
    await runStepwise(table, ops[0]);
    return;
  }

  if (ops.some((op) => op.needsSpatial)) {
    await ensureSpatial(table);
  }

  // Each fragment is cleaned individually: cleanSQL's WHERE handling must not
  // cross fragment boundaries once they are composed into one statement.
  const ctes: CompiledCte[] = [];
  // The schema of the next fragment's input, reused while operations declare
  // they preserve it, so a run of same-shape steps costs at most one
  // DESCRIBE round-trip.
  let schema: TableSchema | null = null;
  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    let select: string;
    try {
      if (op.kind === "source") {
        select = cleanSQL(op.buildSelect());
      } else {
        const input = ctes.length === 0
          ? quoteIdentifier(table.name)
          : quoteIdentifier(ctes[ctes.length - 1].alias);
        if (op.needsSchema && schema === null) {
          schema = await describeChain(table, ctes);
        }
        select = cleanSQL(op.buildSelect(input, schema ?? {}));
      }
    } catch (error) {
      // Flush-time validation (or a broken earlier fragment surfacing at
      // DESCRIBE) fails the chain at this operation. The steps before it
      // already succeeded in program order, so they execute before the
      // error propagates — like a v1 script failing at this line.
      if (ctes.length > 0) {
        await executeFused(table, ops.slice(0, i), ctes);
      }
      throw error;
    }
    ctes.push({
      alias: `s${ctes.length + 1}`,
      select,
      values: op.kind === "source"
        ? op.values ?? []
        : resolveValues(op, schema ?? {}),
    });
    if (op.kind === "source" || op.preservesSchema !== true) {
      schema = null;
    }
  }
  await executeFused(table, ops, ctes);
}

async function executeFused(
  table: SimpleTable,
  ops: RelationalOp[],
  ctes: CompiledCte[],
): Promise<void> {
  const query = `CREATE OR REPLACE TABLE ${
    quoteIdentifier(table.name)
  } AS WITH ${
    ctes.map((c) => `${quoteIdentifier(c.alias)} AS (${c.select})`).join(", ")
  } SELECT * FROM ${quoteIdentifier(ctes[ctes.length - 1].alias)}`;

  try {
    await queryDB(
      table,
      query,
      mergeOptions(table, {
        table: table.name,
        method: ops.map((op) => op.method).join(" + "),
        parameters: Object.fromEntries(
          ops.map((op, i) => [`${i + 1}. ${op.method}`, op.parameters]),
        ),
        values: ctes.flatMap((cte) => cte.values),
        noClean: true,
      }),
    );
  } catch (fusedError) {
    // Re-run the segment step by step to pinpoint the culprit method and
    // report it exactly as immediate execution would have.
    for (const op of ops) {
      await runStepwise(table, op);
    }
    // Every step succeeded on its own: the failure came from the fusion
    // itself. The table now holds the correct stepwise result, so we warn
    // instead of throwing.
    console.warn(
      `The fused query for ${
        ops.map((op) => op.method).join(" + ")
      } failed, but running the methods one by one succeeded. Please report this as a bug to https://github.com/nshiab/simple-data-analysis-core/issues.\n${
        fusedError instanceof Error ? fusedError.message : String(fusedError)
      }`,
    );
  }
}

async function runStepwise(
  table: SimpleTable,
  op: RelationalOp,
): Promise<void> {
  if (op.needsSpatial) {
    await ensureSpatial(table);
  }
  if (op.kind === "source") {
    const select = cleanSQL(op.buildSelect());
    await queryDB(
      table,
      `CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS ${select}`,
      mergeOptions(table, {
        table: table.name,
        method: op.method,
        parameters: op.parameters,
        values: op.values ?? [],
        noClean: true,
      }),
    );
    return;
  }
  const schema = op.needsSchema ? await describeChain(table, []) : {};
  // The fragment is cleaned exactly as it would be inside a fused statement,
  // so the stepwise path executes the same SQL as the fused path.
  const select = cleanSQL(op.buildSelect(quoteIdentifier(table.name), schema));
  await queryDB(
    table,
    `CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS ${select}`,
    mergeOptions(table, {
      table: table.name,
      method: op.method,
      parameters: op.parameters,
      values: resolveValues(op, schema),
      noClean: true,
    }),
  );
}

function resolveValues(op: FusableOp, schema: TableSchema) {
  return typeof op.values === "function" ? op.values(schema) : op.values ?? [];
}

/**
 * Returns the schema at the current point in the fused chain. With no CTEs
 * yet, this describes the table itself; otherwise it describes the output of
 * the last fragment. DESCRIBE is planning-only, so no data is computed.
 */
async function describeChain(
  table: SimpleTable,
  ctes: CompiledCte[],
): Promise<TableSchema> {
  const select = ctes.length === 0
    ? `SELECT * FROM ${quoteIdentifier(table.name)}`
    : `WITH ${
      ctes.map((c) => `${quoteIdentifier(c.alias)} AS (${c.select})`).join(", ")
    } SELECT * FROM ${quoteIdentifier(ctes[ctes.length - 1].alias)}`;
  const query = ctes.length === 0
    ? `DESCRIBE ${quoteIdentifier(table.name)}`
    : `DESCRIBE ${select}`;
  const values = ctes.flatMap((cte) => cte.values);
  const types = await queryDB(
    table,
    query,
    mergeOptions(table, {
      table: table.name,
      method: null,
      parameters: null,
      returnData: true,
      values,
      noClean: true,
    }),
  );
  return extractTypes(types);
}
