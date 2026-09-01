import crypto from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import type SimpleTable from "../class/SimpleTable.ts";
import {
  cacheEntryExpired,
  cacheLoadMessage,
  cacheTtlMessage,
} from "./cacheDiagnostics.ts";
import prettyDuration from "./prettyDuration.ts";

type FileCacheSource = {
  file: string | null;
  creation: number;
  duration?: number;
  formatVersion?: string;
};

type FileCacheSources = { [id: string]: FileCacheSource };

export function createFileCacheId(prefix: string, identity: unknown): string {
  const hash = crypto.createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  return `${prefix}.${hash}`;
}

export default async function fileCache(
  table: SimpleTable,
  options: {
    directory: string;
    enabled: boolean;
    extension: string;
    formatVersion: string;
    id: string;
    method: string;
    ttl?: number;
    load: (file: string) => Promise<void>;
    compute: () => Promise<void>;
    write: (file: string) => Promise<void>;
  },
): Promise<void> {
  if (!options.enabled) {
    logFileCacheDisabled(table, options.method);
  } else if (await loadFileCache(table, options)) {
    return;
  }

  const start = Date.now();
  await options.compute();
  if (options.enabled) {
    await writeFileCache(table, {
      ...options,
      duration: Date.now() - start,
    });
  }
}

async function loadFileCache(
  table: SimpleTable,
  options: {
    directory: string;
    formatVersion: string;
    id: string;
    method: string;
    ttl?: number;
    load: (file: string) => Promise<void>;
  },
): Promise<boolean> {
  const sourcesFile = `${options.directory}/sources.json`;
  const sources = readFileCacheSources(sourcesFile);
  const source = sources[options.id];
  const now = Date.now();

  if (table.sdb.cacheVerbose) {
    console.log(`\n${options.method} cache for ${table.name}`);
  }
  if (source === undefined) {
    logCacheMiss(table, "No matching cache entry exists.");
    return false;
  }
  if (source.formatVersion !== options.formatVersion) {
    logCacheMiss(table, "The cache format changed.");
    return false;
  }
  if (source.file === null || !existsSync(source.file)) {
    logCacheMiss(table, "The cached file is missing.");
    return false;
  }
  if (
    options.ttl !== undefined &&
    cacheEntryExpired(source.creation, options.ttl, now)
  ) {
    table.sdb.cacheVerbose &&
      console.log(
        `Cache entry is stale.\n${
          cacheTtlMessage(source.creation, options.ttl, now, true)
        }\nFetching fresh data and refreshing the cache entry.`,
      );
    return false;
  }

  if (table.sdb.cacheVerbose) {
    console.log("Cache hit.");
    if (options.ttl !== undefined) {
      console.log(cacheTtlMessage(source.creation, options.ttl, now, false));
    }
  }

  const start = Date.now();
  try {
    await options.load(source.file);
  } catch {
    rmSync(source.file, { force: true });
    delete sources[options.id];
    writeFileCacheSources(options.directory, sourcesFile, sources);
    table.sdb.cacheVerbose &&
      console.log("Could not load cached data. Fetching fresh data...");
    return false;
  }
  const end = Date.now();
  if (table.sdb.cacheVerbose) {
    console.log(`${cacheLoadMessage(start, end, source.duration)}\n`);
    if (source.duration !== undefined) {
      table.sdb.cacheTimeSaved += source.duration - (end - start);
    }
  }
  return true;
}

async function writeFileCache(
  table: SimpleTable,
  options: {
    directory: string;
    extension: string;
    formatVersion: string;
    id: string;
    duration: number;
    write: (file: string) => Promise<void>;
  },
): Promise<void> {
  mkdirSync(options.directory, { recursive: true });
  const file = `${options.directory}/${options.id}.${options.extension}`;
  const temporaryFile =
    `${file}.${crypto.randomUUID()}.tmp.${options.extension}`;

  table.sdb.cacheVerbose &&
    console.log(
      `Computations done in ${prettyDuration(0, { end: options.duration })}.`,
    );
  const start = Date.now();
  try {
    await options.write(temporaryFile);
    rmSync(file, { force: true });
    renameSync(temporaryFile, file);
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }
  const end = Date.now();

  const sourcesFile = `${options.directory}/sources.json`;
  const sources = readFileCacheSources(sourcesFile);
  sources[options.id] = {
    file,
    creation: Date.now(),
    duration: options.duration,
    formatVersion: options.formatVersion,
  };
  writeFileCacheSources(options.directory, sourcesFile, sources);

  if (table.sdb.cacheVerbose) {
    console.log(
      `Wrote in cache in ${prettyDuration(start, { end })}.\n`,
    );
    table.sdb.cacheTimeWriting += end - start;
  }
}

function logFileCacheDisabled(
  table: SimpleTable,
  method: string,
): void {
  table.sdb.cacheVerbose &&
    console.log(
      `\n${method} cache for ${table.name}\nCache disabled.\nFetching fresh data without storing a cache entry.`,
    );
}

function logCacheMiss(table: SimpleTable, reason: string): void {
  table.sdb.cacheVerbose &&
    console.log(
      `Cache miss.\n${reason}\nFetching fresh data and storing a new cache entry.`,
    );
}

function readFileCacheSources(sourcesFile: string): FileCacheSources {
  if (!existsSync(sourcesFile)) {
    return {};
  }
  return JSON.parse(readFileSync(sourcesFile, "utf-8")) as FileCacheSources;
}

function writeFileCacheSources(
  directory: string,
  sourcesFile: string,
  sources: FileCacheSources,
): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(sourcesFile, JSON.stringify(sources));
}
