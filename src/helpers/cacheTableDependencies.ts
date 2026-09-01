import { AsyncLocalStorage } from "node:async_hooks";
import type SimpleTable from "../class/SimpleTable.ts";
import { getRegisteredTables } from "./tableRegistry.ts";
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

const dependencyContext = new AsyncLocalStorage<Set<SimpleTable>>();

/** Records a table read when a cache computation is observing dependencies. */
export function recordCacheTableAccess(table: SimpleTable): void {
  dependencyContext.getStore()?.add(table);
}

/** Records registered tables named in user-supplied SQL fragments. */
export function recordCacheTableReferences(
  table: SimpleTable,
  sql: readonly string[],
): void {
  if (dependencyContext.getStore() === undefined) {
    return;
  }
  for (const candidate of getRegisteredTables(table.sdb)) {
    const escaped = candidate.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(
      `(?<![\\w\"])\"?${escaped}\"?(?![\\w\"])`,
      "i",
    );
    if (sql.some((fragment) => pattern.test(fragment))) {
      recordCacheTableAccess(candidate);
    }
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
  await dependencyContext.run(accessed, compute);

  const changedTables = [...availableBeforeCompute]
    .filter(([table, snapshot]) =>
      table !== cachedTable &&
      peekTableGeneration(table) !== snapshot.generationId
    )
    .map(([, snapshot]) => snapshot.tableName);
  if (changedTables.length > 0) {
    throw new Error(cacheTableMutationMessage(cachedTable, changedTables));
  }

  const createdTables = getRegisteredTables(cachedTable.sdb)
    .filter((table) => !availableBeforeCompute.has(table))
    .map((table) => table.name);
  if (createdTables.length > 0) {
    throw new Error(cacheTableCleanupMessage(createdTables));
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
