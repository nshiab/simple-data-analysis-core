import { AsyncLocalStorage } from "node:async_hooks";
import type SimpleTable from "../class/SimpleTable.ts";
import { getRegisteredTables } from "./tableRegistry.ts";
import {
  getTableGeneration,
  type TableGenerationId,
} from "./tableGeneration.ts";

export type CacheTableDependency = {
  tableName: string;
  generationId: TableGenerationId;
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
  const availableBeforeCompute = new Set(
    getRegisteredTables(cachedTable.sdb),
  );
  const accessed = new Set<SimpleTable>();
  await dependencyContext.run(accessed, compute);
  return [...accessed]
    .filter((table) =>
      table !== cachedTable && availableBeforeCompute.has(table)
    )
    .map((table) => ({
      tableName: table.name,
      generationId: getTableGeneration(table),
    }))
    .sort((left, right) => left.tableName.localeCompare(right.tableName));
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
