import { existsSync, renameSync, rmSync } from "node:fs";
import type SimpleTable from "../class/SimpleTable.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";
import { getIndexCacheStrategy } from "./indexDefinitions.ts";
import buildCreateIndexQuery from "./indexQueries.ts";
import cleanPath from "./cleanPath.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

const CACHE_DATABASE = "__sda_cache_entry";

type DatabaseRow = { database_name: string };

export async function writeCacheDatabase(
  table: SimpleTable,
  file: string,
  indexes: IndexDefinition[],
): Promise<void> {
  const temporaryFile = `${file}.${crypto.randomUUID()}.tmp.db`;
  const cacheDatabase = quoteIdentifier(CACHE_DATABASE);
  const currentDatabase = quoteIdentifier(await getCurrentDatabase(table));
  const persistedIndexes = indexes.filter((index) =>
    getIndexCacheStrategy(index) === "persist"
  );
  await loadIndexExtensions(table, persistedIndexes);
  try {
    await table.sdb.customQuery(
      `ATTACH '${cleanPath(temporaryFile)}' AS ${cacheDatabase};
      CREATE TABLE ${cacheDatabase}.${quoteIdentifier(table.name)} AS
        SELECT * FROM ${quoteIdentifier(table.name)};`,
    );
    if (persistedIndexes.length > 0) {
      await table.sdb.customQuery(`USE ${cacheDatabase};`);
      await table.sdb.customQuery(
        buildIndexQueries(table.name, persistedIndexes),
      );
      await table.sdb.customQuery(`USE ${currentDatabase};`);
    }
    await table.sdb.customQuery(
      `CHECKPOINT ${cacheDatabase};
      DETACH ${cacheDatabase};`,
    );
    try {
      renameSync(temporaryFile, file);
    } catch (error) {
      if (!isReplaceRenameError(error) || !existsSync(file)) {
        throw error;
      }
      rmSync(file);
      renameSync(temporaryFile, file);
    }
  } catch (error) {
    await restoreDatabaseAfterFailure(table, currentDatabase, cacheDatabase);
    if (existsSync(temporaryFile)) {
      rmSync(temporaryFile);
    }
    throw error;
  }
}

function isReplaceRenameError(error: unknown): boolean {
  if (!(error instanceof Error) || !("code" in error)) {
    return false;
  }
  return error.code === "EEXIST" || error.code === "EPERM";
}

export async function loadCacheDatabase(
  table: SimpleTable,
  file: string,
  indexes: IndexDefinition[],
  geo: boolean,
): Promise<void> {
  const cacheDatabase = quoteIdentifier(CACHE_DATABASE);
  const currentDatabase = quoteIdentifier(await getCurrentDatabase(table));
  if (geo) {
    await table.sdb.customQuery("INSTALL spatial; LOAD spatial;");
  }
  await loadIndexExtensions(table, indexes);
  table.indexes = [];

  const dropFts = `DROP SCHEMA IF EXISTS ${
    quoteIdentifier(`fts_main_${table.name}`)
  } CASCADE;`;
  try {
    await table.sdb.customQuery(
      `${dropFts}
      DROP TABLE IF EXISTS ${quoteIdentifier(table.name)};
      ATTACH '${cleanPath(file)}' AS ${cacheDatabase} (READ_ONLY);
      COPY FROM DATABASE ${cacheDatabase} TO ${currentDatabase};
      DETACH ${cacheDatabase};`,
    );
    const indexesToRebuild = indexes.filter((index) =>
      getIndexCacheStrategy(index) === "rebuild"
    );
    const indexQueries = buildIndexQueries(table.name, indexesToRebuild);
    if (indexQueries.length > 0) {
      await table.sdb.customQuery(indexQueries);
    }
  } catch (error) {
    await restoreDatabaseAfterFailure(table, currentDatabase, cacheDatabase);
    throw error;
  }

  table.indexes = structuredClone(indexes);
}

async function getCurrentDatabase(table: SimpleTable): Promise<string> {
  const rows = await table.sdb.customQuery(
    "SELECT current_database() AS database_name;",
    { returnData: true },
  ) as DatabaseRow[];
  return rows[0].database_name;
}

async function loadIndexExtensions(
  table: SimpleTable,
  indexes: IndexDefinition[],
): Promise<void> {
  const queries: string[] = [];
  if (indexes.some((index) => index.kind === "vss")) {
    queries.push("INSTALL vss; LOAD vss;");
  }
  if (indexes.some((index) => index.kind === "fts")) {
    queries.push("INSTALL fts; LOAD fts;");
  }
  if (queries.length > 0) {
    await table.sdb.customQuery(queries.join("\n"));
  }
}

function buildIndexQueries(
  table: string,
  indexes: IndexDefinition[],
): string {
  return indexes.map((index) =>
    `${
      index.kind === "vss"
        ? "SET hnsw_enable_experimental_persistence = true;\n"
        : ""
    }${buildCreateIndexQuery(table, index)}`
  ).join("\n");
}

async function restoreDatabaseAfterFailure(
  table: SimpleTable,
  currentDatabase: string,
  cacheDatabase: string,
): Promise<void> {
  try {
    await table.sdb.customQuery(`USE ${currentDatabase};`);
  } catch {
    // Preserve the original cache error.
  }
  try {
    await table.sdb.customQuery(`DETACH ${cacheDatabase};`);
  } catch {
    // The cache database may not have been attached yet.
  }
}
