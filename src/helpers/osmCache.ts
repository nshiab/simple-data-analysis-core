import crypto from "node:crypto";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import type SimpleTable from "../class/SimpleTable.ts";
import { cacheEntryExpired } from "./cacheDiagnostics.ts";
import { createFileCacheId } from "./fileCache.ts";
import { formatBytes } from "./osmFiles.ts";
import mergeOptions from "./mergeOptions.ts";
import parseValue from "./parseValue.ts";
import prettyDuration from "./prettyDuration.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

const CACHE_DIRECTORY = ".sda-cache/osm";
const OSM_CACHE_FORMAT_VERSION = "osm-geoparquet-v2";

type OsmCacheSource = {
  file: string;
  creation: number;
  duration?: number;
  formatVersion: string;
};

type OsmCacheSources = { [id: string]: OsmCacheSource };

export function createOsmCacheId(identity: unknown): string {
  return createFileCacheId("osm", [OSM_CACHE_FORMAT_VERSION, identity]);
}

export async function useProcessedOsmCache(
  table: SimpleTable,
  options: {
    id: string;
    enabled: boolean;
    ttl?: number;
    verbose: boolean;
    parameters: { [key: string]: unknown };
    compute: () => Promise<void>;
  },
): Promise<void> {
  if (!options.enabled) {
    options.verbose && console.log(
      "Processed cache disabled. Fresh data will be used without reading or writing cache entries.",
    );
    await options.compute();
    return;
  }

  const sourcesFile = `${CACHE_DIRECTORY}/sources.json`;
  const sources = readSources(sourcesFile);
  const cached = sources[options.id];
  if (cached !== undefined) {
    if (!isOsmCacheSource(cached)) {
      delete sources[options.id];
      writeSources(sourcesFile, sources);
      console.log(
        "The matching processed cache entry was incomplete and was removed. Fresh data is being requested.",
      );
    } else {
      const now = Date.now();
      if (
        options.ttl !== undefined &&
        cacheEntryExpired(cached.creation, options.ttl, now)
      ) {
        const age = now - cached.creation;
        removeEntry(options.id, cached, sources, sourcesFile);
        console.log(
          `Processed cache entry expired after ${
            prettyDuration(0, { end: age })
          }; ` +
            `the configured TTL is ${
              prettyDuration(0, { end: options.ttl * 1000 })
            }.\n` +
            "The matching cache file was removed. Fresh data is being requested.",
        );
      } else if (
        await loadEntry(table, cached, sources, sourcesFile, options)
      ) {
        return;
      }
    }
  } else {
    options.verbose &&
      console.log("No processed cache entry matched this source.");
  }

  const started = Date.now();
  await options.compute();
  const computeDuration = Date.now() - started;
  await writeEntry(table, sources, sourcesFile, options, computeDuration);
}

async function loadEntry(
  table: SimpleTable,
  cached: OsmCacheSource,
  sources: OsmCacheSources,
  sourcesFile: string,
  options: {
    id: string;
    verbose: boolean;
    parameters: { [key: string]: unknown };
  },
): Promise<boolean> {
  if (
    cached.formatVersion !== OSM_CACHE_FORMAT_VERSION ||
    typeof cached.file !== "string" ||
    !existsSync(cached.file)
  ) {
    removeEntry(options.id, cached, sources, sourcesFile);
    console.log(
      "The matching processed cache entry was incomplete or missing and was removed. Fresh data is being requested.",
    );
    return false;
  }

  const size = statSync(cached.file).size;
  options.verbose && console.log(
    `Processed cache hit.\nLoading ${
      formatBytes(size)
    } from the GeoParquet cache; Osmium will not run.`,
  );
  const started = Date.now();
  try {
    await queryDB(
      table,
      `INSTALL spatial;
      LOAD spatial;
      SET geometry_always_xy = true;
      CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS
      SELECT * FROM read_parquet(${parseValue(cached.file)});`,
      mergeOptions(table, {
        table: table.name,
        method: "loadOpenStreetMap()",
        parameters: options.parameters,
      }),
    );
    table.sdb.spatialLoaded = true;
    if (options.verbose) {
      const rows = await getRowCount(table, options.parameters);
      console.log(
        `Loaded ${rows.toLocaleString("en-US")} rows in ${
          prettyDuration(started)
        }.`,
      );
      if (cached.duration !== undefined) {
        table.sdb.cacheTimeSaved += cached.duration - (Date.now() - started);
      }
    }
    return true;
  } catch {
    removeEntry(options.id, cached, sources, sourcesFile);
    console.log(
      "The matching processed cache entry was corrupt or unusable and was removed. Fresh data is being requested.",
    );
    return false;
  }
}

async function writeEntry(
  table: SimpleTable,
  sources: OsmCacheSources,
  sourcesFile: string,
  options: {
    id: string;
    verbose: boolean;
    parameters: { [key: string]: unknown };
  },
  computeDuration: number,
): Promise<void> {
  mkdirSync(CACHE_DIRECTORY, { recursive: true });
  const file = `${CACHE_DIRECTORY}/${options.id}.geoparquet`;
  const temporaryFile = `${file}.${crypto.randomUUID()}.tmp.geoparquet`;
  options.verbose && console.log("Writing processed GeoParquet cache...");
  const started = Date.now();
  try {
    await queryDB(
      table,
      `COPY ${quoteIdentifier(table.name)} TO ${parseValue(temporaryFile)}
      WITH (FORMAT PARQUET);`,
      mergeOptions(table, {
        table: table.name,
        method: "loadOpenStreetMap()",
        parameters: options.parameters,
      }),
    );
    renameSync(temporaryFile, file);
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }

  const creation = Date.now();
  sources[options.id] = {
    file,
    creation,
    duration: computeDuration,
    formatVersion: OSM_CACHE_FORMAT_VERSION,
  };
  try {
    writeSources(sourcesFile, sources);
  } catch (error) {
    rmSync(file, { force: true });
    delete sources[options.id];
    throw error;
  }
  if (options.verbose) {
    const size = statSync(file).size;
    console.log(`Wrote ${formatBytes(size)} in ${prettyDuration(started)}.`);
    table.sdb.cacheTimeWriting += Date.now() - started;
  }
}

async function getRowCount(
  table: SimpleTable,
  parameters: { [key: string]: unknown },
): Promise<number> {
  const data = await queryDB(
    table,
    `SELECT count(*)::DOUBLE AS count FROM ${quoteIdentifier(table.name)};`,
    mergeOptions(table, {
      table: table.name,
      method: "loadOpenStreetMap()",
      parameters,
      returnData: true,
    }),
  );
  const count = data?.[0]?.count;
  return typeof count === "number" ? count : Number(count ?? 0);
}

function removeEntry(
  id: string,
  source: Partial<OsmCacheSource>,
  sources: OsmCacheSources,
  sourcesFile: string,
): void {
  if (typeof source.file === "string") rmSync(source.file, { force: true });
  delete sources[id];
  writeSources(sourcesFile, sources);
}

function readSources(sourcesFile: string): OsmCacheSources {
  if (!existsSync(sourcesFile)) return {};
  try {
    const value = JSON.parse(readFileSync(sourcesFile, "utf-8")) as unknown;
    return typeof value === "object" && value !== null
      ? value as OsmCacheSources
      : {};
  } catch {
    rmSync(sourcesFile, { force: true });
    console.log(
      "The OpenStreetMap cache index was corrupt and was removed. Fresh data is being requested.",
    );
    return {};
  }
}

function isOsmCacheSource(value: unknown): value is OsmCacheSource {
  if (typeof value !== "object" || value === null) return false;
  const source = value as { [key: string]: unknown };
  return typeof source.file === "string" &&
    typeof source.creation === "number" &&
    Number.isFinite(source.creation) &&
    typeof source.formatVersion === "string" &&
    (source.duration === undefined ||
      (typeof source.duration === "number" &&
        Number.isFinite(source.duration)));
}

function writeSources(sourcesFile: string, sources: OsmCacheSources): void {
  mkdirSync(CACHE_DIRECTORY, { recursive: true });
  const temporaryFile = `${sourcesFile}.${crypto.randomUUID()}.tmp`;
  try {
    writeFileSync(temporaryFile, JSON.stringify(sources));
    renameSync(temporaryFile, sourcesFile);
  } catch (error) {
    rmSync(temporaryFile, { force: true });
    throw error;
  }
}
