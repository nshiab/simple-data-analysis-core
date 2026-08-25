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

const CACHE_DIRECTORY = ".sda-cache/osm";
const CACHE_SOURCES_FILE = `${CACHE_DIRECTORY}/sources.json`;
const OSM_CACHE_FORMAT_VERSION = "osm-geoparquet-v1";

type CacheSource = {
  file: string | null;
  creation: number;
  duration: number;
  geo: boolean;
  formatVersion?: string;
};

type CacheSources = { [id: string]: CacheSource };

export function createOsmCacheId(identity: {
  endpoint: string;
  bbox: { west: number; south: number; east: number; north: number };
  query: string;
  queryGeneratorVersion: string;
}): string {
  const hash = crypto.createHash("sha256")
    .update(JSON.stringify(identity))
    .digest("hex");
  return `osm.${hash}`;
}

export async function loadProcessedOsmCache(
  table: SimpleTable,
  id: string,
  parameters: { [key: string]: unknown },
): Promise<boolean> {
  const sources = readCacheSources();
  const source = sources[id];
  if (
    source === undefined ||
    source.formatVersion !== OSM_CACHE_FORMAT_VERSION ||
    source.file === null || !existsSync(source.file)
  ) {
    return false;
  }

  try {
    await queryDB(
      table,
      `INSTALL spatial;
      LOAD spatial;
      SET geometry_always_xy = true;
      CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS
      SELECT * FROM read_parquet(${parseValue(source.file)});`,
      mergeOptions(table, {
        table: table.name,
        method: "loadOSM()",
        parameters,
      }),
    );
  } catch {
    rmSync(source.file, { force: true });
    delete sources[id];
    writeCacheSources(sources);
    return false;
  }

  table.sdb.spatialLoaded = true;
  return true;
}

export async function writeProcessedOsmCache(
  table: SimpleTable,
  id: string,
  parameters: { [key: string]: unknown },
  duration: number,
): Promise<void> {
  mkdirSync(CACHE_DIRECTORY, { recursive: true });
  const file = `${CACHE_DIRECTORY}/${id}.geoparquet`;
  const temporaryFile = `${file}.${crypto.randomUUID()}.tmp.geoparquet`;

  try {
    await queryDB(
      table,
      `COPY ${quoteIdentifier(table.name)} TO ${parseValue(temporaryFile)}
      WITH (FORMAT PARQUET);`,
      mergeOptions(table, {
        table: table.name,
        method: "loadOSM()",
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
    duration,
    geo: true,
    formatVersion: OSM_CACHE_FORMAT_VERSION,
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
