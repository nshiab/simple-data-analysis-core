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
import mergeOptions from "./mergeOptions.ts";
import parseValue from "./parseValue.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

const CACHE_DIRECTORY = ".sda-cache/statcan";
const CACHE_SOURCES_FILE = `${CACHE_DIRECTORY}/sources.json`;
const CACHE_FORMAT_VERSION = "statcan-parquet-v1";

type CacheSource = {
  file: string;
  creation: number;
  formatVersion?: string;
};

type CacheSources = { [id: string]: CacheSource };

export function createStatCanCacheId(pid: string, lang: "en" | "fr"): string {
  const hash = crypto.createHash("sha256")
    .update(JSON.stringify([CACHE_FORMAT_VERSION, pid, lang]))
    .digest("hex");
  return `statcan.${hash}`;
}

export async function loadStatCanCache(
  table: SimpleTable,
  id: string,
  ttl: number | undefined,
  parameters: { [key: string]: unknown },
): Promise<boolean> {
  const sources = readCacheSources();
  const source = sources[id];
  const expired = source !== undefined && ttl !== undefined &&
    Date.now() - source.creation >= ttl * 1000;
  if (
    source === undefined || source.formatVersion !== CACHE_FORMAT_VERSION ||
    expired || !existsSync(source.file)
  ) {
    return false;
  }

  try {
    await queryDB(
      table,
      `CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS
      SELECT * FROM read_parquet(${parseValue(source.file)});`,
      mergeOptions(table, {
        table: table.name,
        method: "loadStatCanData()",
        parameters,
      }),
    );
    return true;
  } catch {
    rmSync(source.file, { force: true });
    delete sources[id];
    writeCacheSources(sources);
    return false;
  }
}

export async function writeStatCanCache(
  table: SimpleTable,
  id: string,
  parameters: { [key: string]: unknown },
): Promise<void> {
  mkdirSync(CACHE_DIRECTORY, { recursive: true });
  const file = `${CACHE_DIRECTORY}/${id}.parquet`;
  const temporaryFile = `${file}.${crypto.randomUUID()}.tmp.parquet`;
  try {
    await queryDB(
      table,
      `COPY ${quoteIdentifier(table.name)} TO ${parseValue(temporaryFile)}
      WITH (FORMAT PARQUET);`,
      mergeOptions(table, {
        table: table.name,
        method: "loadStatCanData()",
        parameters,
      }),
    );
    rmSync(file, { force: true });
    renameSync(temporaryFile, file);
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }

  const sources = readCacheSources();
  sources[id] = {
    file,
    creation: Date.now(),
    formatVersion: CACHE_FORMAT_VERSION,
  };
  writeCacheSources(sources);
}

function readCacheSources(): CacheSources {
  if (!existsSync(CACHE_SOURCES_FILE)) {
    return {};
  }
  return JSON.parse(readFileSync(CACHE_SOURCES_FILE, "utf-8")) as CacheSources;
}

function writeCacheSources(sources: CacheSources): void {
  mkdirSync(CACHE_DIRECTORY, { recursive: true });
  writeFileSync(CACHE_SOURCES_FILE, JSON.stringify(sources));
}
