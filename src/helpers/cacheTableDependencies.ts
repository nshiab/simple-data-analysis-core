import { AsyncLocalStorage } from "node:async_hooks";
import referencedTables from "./referencedTables.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { PendingOp, PendingOpInput } from "./pendingOps.ts";
import {
  getAsyncOperationFrame,
  runWhileDrainingAsyncOperationFrame,
} from "./asyncOperationContext.ts";
import flushAllTables, { runExemptFromFlush } from "./flushAllTables.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import {
  getRegisteredTables,
  retainRegisteredTables,
} from "./tableRegistry.ts";
import {
  getTableGeneration,
  peekTableGeneration,
  type TableGenerationId,
} from "./tableGeneration.ts";

export type CacheTableDependency = {
  tableName: string;
  generationId: TableGenerationId;
};

type CacheTableSnapshot = {
  tableName: string;
  generationId: TableGenerationId | undefined;
};

type CacheComputation = {
  cachedTable: SimpleTable;
  availableBeforeCompute: Map<SimpleTable, CacheTableSnapshot>;
  accessed: Set<SimpleTable>;
  created: Set<SimpleTable>;
  queued: Set<number>;
  open: boolean;
};

const dependencyContext = new AsyncLocalStorage<CacheComputation[]>();

/** Keeps deferred callbacks in their originating cache scope across observers. */
export function captureCacheTableOperation(op: PendingOpInput): PendingOpInput {
  if (op.kind === "barrier" || op.kind === "asyncBarrier") {
    return { ...op, execute: bindCacheContext(op.execute) };
  }
  if (op.kind === "source") {
    return { ...op, buildSelect: bindCacheContext(op.buildSelect) };
  }
  return {
    ...op,
    buildSelect: bindCacheContext(op.buildSelect),
    outputSchema: op.outputSchema === undefined
      ? undefined
      : bindCacheContext(op.outputSchema),
    values: typeof op.values === "function"
      ? bindCacheContext(op.values)
      : op.values,
  };
}

function bindCacheContext<Args extends unknown[], Result>(
  callback: (...args: Args) => Result,
): (...args: Args) => Result {
  // Capture only the cache scope: a snapshot of all AsyncLocalStorage stores
  // would also capture stale flush exemptions and async operation frames.
  // An empty scope keeps unrelated work out of the observer's cache callback.
  const frames = dependencyContext.getStore() ?? [];
  return (...args) => dependencyContext.run(frames, () => callback(...args));
}

/** Rejects mutations before they can queue work or execute SQL. */
export function assertCacheTableMutation(table: SimpleTable): void {
  for (const frame of dependencyContext.getStore() ?? []) {
    if (
      frame.open && table !== frame.cachedTable &&
      frame.availableBeforeCompute.has(table)
    ) {
      throw new Error(
        cacheTableMutationMessage(frame.cachedTable, [table.name]),
      );
    }
  }
}

/** Tracks callback-owned handles so failure cleanup does not touch other work. */
export function recordCacheTableCreation(table: SimpleTable): void {
  for (const frame of dependencyContext.getStore() ?? []) {
    if (
      frame.open && table.sdb === frame.cachedTable.sdb &&
      !frame.availableBeforeCompute.has(table)
    ) {
      frame.created.add(table);
    }
  }
}

/** Tracks queued work across nested callbacks, including async barriers. */
export function recordCacheTableOperation(
  table: SimpleTable,
  op: PendingOp,
): void {
  for (const frame of dependencyContext.getStore() ?? []) {
    if (frame.open && table.sdb === frame.cachedTable.sdb) {
      frame.queued.add(op.sequence);
    }
  }
}

/** Records a table read when a cache computation is observing dependencies. */
export function recordCacheTableAccess(table: SimpleTable): void {
  for (const frame of dependencyContext.getStore() ?? []) {
    if (frame.open && table.sdb === frame.cachedTable.sdb) {
      frame.accessed.add(table);
    }
  }
}

/** Records registered tables named in user-supplied SQL fragments. */
export function recordCacheTableReferences(
  table: SimpleTable,
  sql: readonly string[],
): void {
  if (dependencyContext.getStore() === undefined) {
    return;
  }
  for (const candidate of referencedTables(sql, table.sdb)) {
    recordCacheTableAccess(candidate);
  }
}

/** Runs a cache computation while collecting the tables it reads. */
export async function captureCacheTableDependencies(
  cachedTable: SimpleTable,
  compute: () => Promise<void>,
): Promise<CacheTableDependency[]> {
  const availableBeforeCompute = new Map(
    getRegisteredTables(cachedTable.sdb).map((table) => [
      table,
      {
        tableName: table.name,
        generationId: peekTableGeneration(table),
      },
    ]),
  );
  const accessed = new Set<SimpleTable>();
  const frame: CacheComputation = {
    cachedTable,
    availableBeforeCompute,
    accessed,
    created: new Set(),
    queued: new Set(),
    open: true,
  };
  try {
    await dependencyContext.run(
      [...(dependencyContext.getStore() ?? []), frame],
      async () => {
        await compute();
        // A callback can queue a whole computation without observing it.
        // Reject leaked handles before executing that pending computation.
        assertCacheTableCleanup(frame);
        await flushAllTables(cachedTable.sdb);
        // Async barriers may create tables during the final flush.
        assertCacheTableCleanup(frame);
      },
    );
  } catch (error) {
    await cleanupCacheComputation(frame);
    throw error;
  } finally {
    frame.open = false;
  }

  return [...accessed]
    .filter((table) =>
      table !== cachedTable && availableBeforeCompute.has(table)
    )
    .map((table) => {
      const snapshot = availableBeforeCompute.get(table);
      if (snapshot === undefined) {
        throw new Error("A cache table dependency snapshot is missing.");
      }
      return {
        tableName: snapshot.tableName,
        generationId: snapshot.generationId ?? getTableGeneration(table),
      };
    })
    .sort((left, right) => left.tableName.localeCompare(right.tableName));
}

function assertCacheTableCleanup(frame: CacheComputation): void {
  const created = getRegisteredTables(frame.cachedTable.sdb)
    .filter((table) => frame.created.has(table));
  if (created.length > 0) {
    throw new Error(
      cacheTableCleanupMessage(created.map((table) => table.name)),
    );
  }
}

async function cleanupCacheComputation(frame: CacheComputation): Promise<void> {
  const sdb = frame.cachedTable.sdb;
  // Drop only this callback's pending operations, preserving other queues and
  // their database-wide ordering. A nested failure also discards work captured
  // by an enclosing async barrier, which is stored outside pendingOps.
  for (const table of getRegisteredTables(sdb)) {
    const retained = table.pendingOps.filter((op) =>
      !frame.queued.has(op.sequence)
    );
    sdb.pendingCount -= table.pendingOps.length - retained.length;
    table.pendingOps.splice(0, table.pendingOps.length, ...retained);
  }
  const operationFrame = getAsyncOperationFrame(sdb);
  if (operationFrame !== undefined) {
    operationFrame.entries = operationFrame.entries.filter((entry) =>
      !frame.queued.has(entry.op.sequence)
    );
  }
  const created = getRegisteredTables(sdb)
    .filter((table) => frame.created.has(table));
  if (created.length === 0) return;
  // Observers inside compute may already have materialized temporary tables.
  // Cleanup must not flush work requeued after an execution error.
  const removeCreatedTables = () =>
    runExemptFromFlush(sdb, async () => {
      for (const table of created) {
        await sdb.customQuery(
          `DROP TABLE IF EXISTS ${quoteIdentifier(table.name)};`,
        );
      }
    });
  if (operationFrame === undefined) {
    await removeCreatedTables();
  } else {
    // Async frames take precedence over the database-wide flush exemption.
    // Suppress their drain too, without consuming unrelated captured work.
    await runWhileDrainingAsyncOperationFrame(
      operationFrame,
      removeCreatedTables,
    );
  }
  retainRegisteredTables(sdb, (table) => !frame.created.has(table));
}

function cacheTableMutationMessage(
  cachedTable: SimpleTable,
  changedTables: readonly string[],
): string {
  const tables = changedTables.map((name) => JSON.stringify(name)).join(", ");
  const cachedTableName = JSON.stringify(cachedTable.name);
  if (changedTables.length === 1) {
    return `cache() called on ${cachedTableName} cannot modify pre-existing table ${tables}. Modify ${tables} outside this cache() call.`;
  }
  return `cache() called on ${cachedTableName} cannot modify pre-existing tables ${tables}. Modify these tables outside this cache() call.`;
}

function cacheTableCleanupMessage(createdTables: readonly string[]): string {
  const tables = createdTables.map((name) => JSON.stringify(name)).join(", ");
  if (createdTables.length === 1) {
    return `cache() created table ${tables} but did not remove it. Call removeTable() on ${tables} before the callback finishes to avoid downstream errors when the cache is loaded and this table is not recreated.`;
  }
  return `cache() created tables ${tables} but did not remove them. Call removeTable() on these tables before the callback finishes to avoid downstream errors when the cache is loaded and these tables are not recreated.`;
}

/** Checks persisted dependencies against the current registered tables. */
export function cacheTableDependenciesMatch(
  cachedTable: SimpleTable,
  dependencies: readonly CacheTableDependency[] | undefined,
): boolean {
  if (dependencies === undefined) {
    return false;
  }
  const registered = getRegisteredTables(cachedTable.sdb);
  return dependencies.every((dependency) => {
    const table = registered.find((candidate) =>
      candidate.name === dependency.tableName
    );
    return table !== undefined &&
      getTableGeneration(table) === dependency.generationId;
  });
}

/** Describes changed or unavailable table dependencies for verbose logging. */
export function changedCacheTableDependenciesMessage(
  cachedTable: SimpleTable,
  dependencies: readonly CacheTableDependency[],
): string {
  const registered = getRegisteredTables(cachedTable.sdb);
  const changed: CacheTableDependency[] = [];
  const unchanged: CacheTableDependency[] = [];
  for (const dependency of dependencies) {
    const table = registered.find((candidate) =>
      candidate.name === dependency.tableName
    );
    if (
      table === undefined ||
      getTableGeneration(table) !== dependency.generationId
    ) {
      changed.push(dependency);
    } else {
      unchanged.push(dependency);
    }
  }

  return [
    cacheTableDependencyStatusMessage("changed", changed),
    cacheTableDependencyStatusMessage("unchanged", unchanged),
  ].filter((message) => message.length > 0).join("\n");
}

/** Lists unchanged dependencies for cache-hit verbose logging. */
export function unchangedCacheTableDependenciesMessage(
  dependencies: readonly CacheTableDependency[],
): string {
  return cacheTableDependencyStatusMessage("unchanged", dependencies);
}

function cacheTableDependencyStatusMessage(
  status: "changed" | "unchanged",
  dependencies: readonly CacheTableDependency[],
): string {
  if (dependencies.length === 0) {
    return "";
  }
  return `Table dependencies ${status}: ${
    dependencies.map((dependency) => JSON.stringify(dependency.tableName))
      .join(", ")
  }.`;
}
