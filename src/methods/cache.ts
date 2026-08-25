import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type SimpleTable from "../class/SimpleTable.ts";
import crypto from "node:crypto";
import flushAllTables from "../helpers/flushAllTables.ts";
import formatDate from "../helpers/formatDate.ts";
import prettyDuration from "../helpers/prettyDuration.ts";
import serializeCacheInputs, {
  getCacheInputLabel,
} from "../helpers/serializeCacheInputs.ts";
import {
  createTableGenerationId,
  peekTableGeneration,
  restoreTableGeneration,
  type TableGenerationId,
} from "../helpers/tableGeneration.ts";
import {
  loadCacheDatabase,
  writeCacheDatabase,
} from "../helpers/cacheDatabase.ts";
import type { IndexDefinition } from "../helpers/indexDefinitions.ts";

const CACHE_FORMAT_VERSION = "duckdb-v3";

type CacheSource = {
  file: string | null;
  creation: number;
  duration: number;
  geo: boolean;
  entryGeneration?: TableGenerationId | null;
  generationId?: TableGenerationId;
  indexes?: IndexDefinition[];
  formatVersion?: string;
  codeHash?: string;
  inputHashes?: string[];
};

type CacheSources = {
  [key: string]: CacheSource;
};

type CacheDiagnosticSource = CacheSource & {
  formatVersion: string;
  codeHash: string;
  inputHashes: string[];
};

export default async function cache<Table extends SimpleTable>(
  table: Table,
  compute: (table: Table) => void | Promise<void>,
  options: {
    ttl?: number;
    inputs?: readonly unknown[];
    verbose?: boolean;
  } = {},
) {
  options.verbose &&
    console.log(`\ncache() for ${table.name}`);

  const cachePath = "./.sda-cache";
  if (!existsSync(cachePath)) {
    mkdirSync(cachePath);
  }
  const cacheSourcesPath = `${cachePath}/sources.json`;
  let cacheSources: CacheSources = {};
  if (existsSync(cacheSourcesPath)) {
    cacheSources = JSON.parse(readFileSync(cacheSourcesPath, "utf-8"));
  }

  const functionBody = compute.toString();
  const entryGeneration = peekTableGeneration(table) ?? null;
  const inputs = options.inputs?.filter((input) => input !== table) ?? [];
  const hasInputs = inputs.length > 0;
  const serializedInputs = hasInputs ? serializeCacheInputs(inputs) : null;
  const codeHash = createHash(functionBody);
  const inputHashes = hasInputs
    ? inputs.map((input) => createHash(serializeCacheInputs([input])))
    : [];
  const hash = createHash(JSON.stringify([
    CACHE_FORMAT_VERSION,
    table.name,
    entryGeneration,
    functionBody,
    serializedInputs,
  ]));
  const requestedId = `${table.name}.${hash}`;
  let id = requestedId;
  let cache = cacheSources[id];
  if (cache === undefined) {
    const alreadyApplied = findAlreadyAppliedCache(
      table.name,
      cacheSources,
      entryGeneration,
      codeHash,
      inputHashes,
    );
    if (alreadyApplied !== undefined) {
      [id, cache] = alreadyApplied;
    }
  }
  const now = Date.now();

  if (cache !== undefined) {
    ensureCacheDiagnostics(
      cache,
      cacheSources,
      cacheSourcesPath,
      codeHash,
      inputHashes,
    );
  }

  if (cache === undefined) {
    if (options.verbose) {
      logCacheMiss(
        table.name,
        cacheSources,
        codeHash,
        inputHashes,
        inputs,
        entryGeneration,
      );
    }
    await runAndWrite(
      table,
      compute,
      cacheSources,
      cacheSourcesPath,
      cachePath,
      id,
      codeHash,
      inputHashes,
      entryGeneration,
    );
  } else if (
    cache &&
    typeof options.ttl === "number" &&
    now - cache.creation > options.ttl * 1000
  ) {
    const refreshId = cache.entryGeneration === entryGeneration
      ? id
      : requestedId;
    options.verbose &&
      console.log(
        `Cache entry is stale.\n${identityMatchMessage(inputHashes)}\nTTL of ${
          prettyDuration(0, { end: options.ttl * 1000 })
        } has expired.\nThe creation date is ${
          formatDate(
            new Date(cache.creation),
            "Month DD, YYYY, at HH:MM period",
          )
        }.\nIt was created ${
          prettyDuration(cache.creation, { end: now })
        } ago.\nRunning computations and refreshing the cache entry.`,
      );
    await runAndWrite(
      table,
      compute,
      cacheSources,
      cacheSourcesPath,
      cachePath,
      refreshId,
      codeHash,
      inputHashes,
      entryGeneration,
    );
  } else {
    options.verbose &&
      console.log(`Cache hit.\n${identityMatchMessage(inputHashes)}`);
    if (typeof options.ttl === "number") {
      const ttlLimit = new Date(cache.creation + options.ttl * 1000);
      (options.verbose) &&
        console.log(
          `TTL of ${
            prettyDuration(0, { end: options.ttl * 1000 })
          } has not expired.\nThe creation date is ${
            formatDate(
              new Date(cache.creation),
              "Month DD, YYYY, at HH:MM period",
            )
          }.\nThere are ${prettyDuration(now, { end: ttlLimit })} left.`,
        );
    }
    if (cache.file === null) {
      console.log("No data in cache. Nothing to load.");
    } else {
      const start = Date.now();
      try {
        await loadCacheDatabase(
          table,
          cache.file,
          cache.indexes ?? [],
          cache.geo,
        );
      } catch {
        options.verbose &&
          console.log("Could not load cached data. Recomputing...");
        if (existsSync(cache.file)) {
          rmSync(cache.file);
        }
        delete cacheSources[id];
        await runAndWrite(
          table,
          compute,
          cacheSources,
          cacheSourcesPath,
          cachePath,
          requestedId,
          codeHash,
          inputHashes,
          entryGeneration,
        );
        return;
      }
      if (table.sdb.cacheSourcesUsed.indexOf(id) < 0) {
        table.sdb.cacheSourcesUsed.push(id);
      }
      const end = Date.now();
      const duration = end - start;
      if (options.verbose) {
        console.log(
          `Data loaded in ${
            prettyDuration(start, { end })
          }.\nRunning computations previously took ${
            prettyDuration(0, { end: cache.duration })
          }.\nYou saved ${
            prettyDuration(duration, { end: cache.duration })
          }.\n`,
        );
        table.sdb.cacheTimeSaved += cache.duration - duration;
      }
    }
    restoreCachedGeneration(
      table,
      cache,
      cacheSources,
      cacheSourcesPath,
    );
  }
}

async function runAndWrite<Table extends SimpleTable>(
  table: Table,
  compute: (table: Table) => void | Promise<void>,
  cacheSources: CacheSources,
  cacheSourcesPath: string,
  cachePath: string,
  id: string,
  codeHash: string,
  inputHashes: string[],
  entryGeneration: TableGenerationId | null,
) {
  const start = Date.now();
  await compute(table);
  // run() only queues the sync builders in the user's callback; the actual
  // computation happens at the flush, so it must be included in the timing
  // that decides how much the cache saves on later hits.
  await flushAllTables(table.sdb);
  const end = Date.now();
  const duration = end - start;
  const generationId = createTableGenerationId();
  table.sdb.cacheVerbose &&
    console.log(
      `Computations done in ${prettyDuration(start, { end })}.`,
    );
  if (!(await table.sdb.hasTable(table.name))) {
    console.log(`No data in table ${table.name}. Nothing stored in cache.`);
    cacheSources[id] = {
      creation: Date.now(),
      duration,
      file: null,
      geo: false,
      entryGeneration,
      generationId,
      indexes: [],
      formatVersion: CACHE_FORMAT_VERSION,
      codeHash,
      inputHashes,
    };
  } else {
    const types = await table.getTypes();
    const geometriesColumns = Object.values(types).filter(
      (d) => d.toLowerCase().includes("geometry"),
    ).length;
    const file = `${cachePath}/${id}.db`;
    const indexes = structuredClone(table.indexes);
    const writeStart = Date.now();
    await writeCacheDatabase(table, file, indexes);
    const writeEnd = Date.now();
    table.sdb.cacheVerbose &&
      console.log(
        `Wrote in cache in ${prettyDuration(writeStart, { end: writeEnd })}.\n`,
      );
    table.sdb.cacheTimeWriting += writeEnd - writeStart;
    cacheSources[id] = {
      creation: Date.now(),
      duration,
      file,
      geo: geometriesColumns > 0,
      entryGeneration,
      generationId,
      indexes,
      formatVersion: CACHE_FORMAT_VERSION,
      codeHash,
      inputHashes,
    };
    if (table.sdb.cacheSourcesUsed.indexOf(id) < 0) {
      table.sdb.cacheSourcesUsed.push(id);
    }
  }

  writeFileSync(cacheSourcesPath, JSON.stringify(cacheSources));
  restoreTableGeneration(table, generationId);
}

function restoreCachedGeneration(
  table: SimpleTable,
  cache: CacheSource,
  cacheSources: CacheSources,
  cacheSourcesPath: string,
): void {
  if (cache.generationId === undefined) {
    cache.generationId = createTableGenerationId();
    writeFileSync(cacheSourcesPath, JSON.stringify(cacheSources));
  }
  restoreTableGeneration(table, cache.generationId);
}

function ensureCacheDiagnostics(
  cache: CacheSource,
  cacheSources: CacheSources,
  cacheSourcesPath: string,
  codeHash: string,
  inputHashes: string[],
): void {
  if (
    cache.formatVersion === undefined || cache.codeHash === undefined ||
    cache.inputHashes === undefined
  ) {
    cache.formatVersion = CACHE_FORMAT_VERSION;
    cache.codeHash = codeHash;
    cache.inputHashes = inputHashes;
    writeFileSync(cacheSourcesPath, JSON.stringify(cacheSources));
  }
}

function createHash(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function identityMatchMessage(inputHashes: string[]): string {
  return inputHashes.length === 0
    ? "Compute function unchanged."
    : `Compute function unchanged.\nInputs unchanged (${inputHashes.length} checked).`;
}

function findAlreadyAppliedCache(
  tableName: string,
  cacheSources: CacheSources,
  entryGeneration: TableGenerationId | null,
  codeHash: string,
  inputHashes: string[],
): [string, CacheSource] | undefined {
  if (entryGeneration === null) {
    return undefined;
  }
  return Object.entries(cacheSources)
    .filter(([id, source]) =>
      id.startsWith(`${tableName}.`) &&
      source.formatVersion === CACHE_FORMAT_VERSION &&
      source.generationId === entryGeneration &&
      source.codeHash === codeHash &&
      arraysEqual(source.inputHashes, inputHashes)
    )
    .reduce<[string, CacheSource] | undefined>(
      (latest, candidate) =>
        latest === undefined || candidate[1].creation > latest[1].creation
          ? candidate
          : latest,
      undefined,
    );
}

function arraysEqual(
  left: readonly string[] | undefined,
  right: readonly string[],
): boolean {
  return left !== undefined && left.length === right.length &&
    left.every((value, index) => value === right[index]);
}

function logCacheMiss(
  tableName: string,
  cacheSources: CacheSources,
  codeHash: string,
  inputHashes: string[],
  inputs: readonly unknown[],
  entryGeneration: TableGenerationId | null,
): void {
  const candidates = Object.entries(cacheSources)
    .filter(([id]) => id.startsWith(`${tableName}.`))
    .map(([, source]) => source)
    .filter(isCacheDiagnosticSource);

  let reason: string;
  if (candidates.length === 0) {
    const hasLegacyCandidate = Object.keys(cacheSources).some((id) =>
      id.startsWith(`${tableName}.`)
    );
    reason = hasLegacyCandidate
      ? "A previous entry exists, but it predates detailed cache diagnostics. Its code, inputs, or cache format changed."
      : "No matching cache entry exists for this computation.";
  } else {
    const sameFormat = candidates.filter((source) =>
      source.formatVersion === CACHE_FORMAT_VERSION
    );
    const sameCode = latestCacheSource(
      sameFormat.filter((source) => source.codeHash === codeHash),
    );

    if (sameCode !== undefined) {
      const inputsMessage = changedInputsMessage(
        sameCode.inputHashes,
        inputHashes,
        inputs,
      );
      const tableMessage = sameCode.entryGeneration === entryGeneration
        ? ""
        : "Current table changed.";
      const changes = [tableMessage, inputsMessage].filter((message) =>
        message.length > 0
      );
      reason = changes.length === 0
        ? "Compute function unchanged."
        : `Compute function unchanged.\n${changes.join("\n")}`;
    } else if (sameFormat.length === 0) {
      reason = "The cache format changed.";
    } else {
      reason = "No matching cache entry exists for this computation.";
    }
  }

  console.log(
    `Cache miss.\n${reason}\nRunning computations and storing a new cache entry.`,
  );
}

function latestCacheSource(
  cacheSources: CacheDiagnosticSource[],
): CacheDiagnosticSource | undefined {
  return cacheSources.reduce<CacheDiagnosticSource | undefined>(
    (latest, source) =>
      latest === undefined || source.creation > latest.creation
        ? source
        : latest,
    undefined,
  );
}

function isCacheDiagnosticSource(
  source: CacheSource,
): source is CacheDiagnosticSource {
  return source.formatVersion !== undefined && source.codeHash !== undefined &&
    source.inputHashes !== undefined;
}

function changedInputsMessage(
  previousHashes: string[],
  inputHashes: string[],
  inputs: readonly unknown[],
): string {
  const changes: string[] = [];
  const sharedLength = Math.min(previousHashes.length, inputHashes.length);
  for (let i = 0; i < sharedLength; i++) {
    if (previousHashes[i] !== inputHashes[i]) {
      changes.push(
        `${getCacheInputLabel(inputs[i]) ?? `inputs[${i}]`} changed`,
      );
    }
  }
  for (let i = sharedLength; i < inputHashes.length; i++) {
    changes.push(
      `${getCacheInputLabel(inputs[i]) ?? `inputs[${i}]`} was added`,
    );
  }
  for (let i = sharedLength; i < previousHashes.length; i++) {
    changes.push(`inputs[${i}] was removed`);
  }

  return changes.length === 0
    ? inputHashes.length === 0
      ? ""
      : `Inputs unchanged (${inputHashes.length} checked).`
    : `Inputs changed: ${changes.join(", ")}.`;
}
