import { realpathSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import SDAError from "../class/SDAError.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import loadOsmFile from "../helpers/loadOsmFile.ts";
import { createOsmCacheId, useProcessedOsmCache } from "../helpers/osmCache.ts";
import {
  downloadOsmToTemporaryFile,
  formatBytes,
  getOsmFileSuffix,
  isRemoteOsmUrl,
  normalizeRemoteOsmUrl,
  sanitizeOsmUrl,
} from "../helpers/osmFiles.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import prettyDuration from "../helpers/prettyDuration.ts";
import queryDB from "../helpers/queryDB.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";

const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const DEFAULT_REMOTE_FILE_TIMEOUT = 30 * 60;
const QUERY_GENERATOR_VERSION = "overpass-ql-v1";

type BoundingBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type CommonOptions = {
  cache?: boolean;
  ttl?: number;
  retries?: number;
  retryDelay?: number;
  verbose?: boolean;
};

type LoadOpenStreetMapFileOptions = CommonOptions;

type LoadOpenStreetMapOverpassOptions = CommonOptions & {
  filters: string | [string, string] | [string, string][];
  endpoint?: string;
  timeout?: number;
};

export default function loadOpenStreetMap(
  table: SimpleTable,
  source: string | BoundingBox,
  options:
    | LoadOpenStreetMapFileOptions
    | LoadOpenStreetMapOverpassOptions = {},
): void {
  if (typeof source === "string") {
    queueOpenStreetMapFileLoad(
      table,
      source,
      options as LoadOpenStreetMapFileOptions,
    );
    return;
  }
  queueOverpassLoad(
    table,
    source,
    options as LoadOpenStreetMapOverpassOptions,
  );
}

function queueOpenStreetMapFileLoad(
  table: SimpleTable,
  file: string,
  options: LoadOpenStreetMapFileOptions,
): void {
  const suffix = getOsmFileSuffix(file);
  if (suffix === null) {
    throw new Error(
      "loadOpenStreetMap() file paths and URLs must end with .osm or .osm.pbf.",
    );
  }
  options = structuredClone(options);
  assertOptions(options, false);

  let remoteUrl: string | undefined;
  if (isRemoteOsmUrl(file)) {
    remoteUrl = normalizeRemoteOsmUrl(file);
  } else {
    try {
      const url = new URL(file);
      if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new Error(
          "loadOpenStreetMap() URL sources must use HTTP or HTTPS.",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("must use HTTP")) {
        throw error;
      }
    }
    if (options.retries !== undefined || options.retryDelay !== undefined) {
      throw new Error(
        "loadOpenStreetMap() options.retries and options.retryDelay are network-only and cannot be used with a local path.",
      );
    }
  }

  const parameters = { file, options };
  queueOp(table, {
    kind: "barrier",
    method: "loadOpenStreetMap()",
    parameters,
    execute: () =>
      executeOpenStreetMapFileLoad(
        table,
        remoteUrl ?? file,
        suffix,
        options,
        parameters,
      ),
  });
}

async function executeOpenStreetMapFileLoad(
  table: SimpleTable,
  file: string,
  suffix: ".osm" | ".osm.pbf",
  options: LoadOpenStreetMapFileOptions,
  parameters: { [key: string]: unknown },
): Promise<void> {
  const started = Date.now();
  const verbose = options.verbose === true || table.sdb.cacheVerbose;
  const remote = isRemoteOsmUrl(file);
  const displayedSource = remote ? sanitizeOsmUrl(file) : resolve(file);
  verbose && console.log(`loadOpenStreetMap(): loading ${displayedSource}`);

  try {
    if (remote) {
      const cacheId = createOsmCacheId({ kind: "remote", url: file });
      await useProcessedOsmCache(table, {
        id: cacheId,
        enabled: options.cache ?? true,
        ttl: options.ttl,
        verbose,
        parameters,
        compute: async () => {
          const temporaryFile = await downloadOsmToTemporaryFile(file, {
            suffix,
            prefix: cacheId,
            request: { headers: { "accept-encoding": "gzip" } },
            retries: options.retries,
            retryDelay: options.retryDelay,
            timeout: DEFAULT_REMOTE_FILE_TIMEOUT,
            verbose,
          });
          try {
            await processOsmFile(table, temporaryFile, parameters, verbose);
          } finally {
            rmSync(temporaryFile, { force: true });
            verbose && console.log("Removed the temporary raw OSM download.");
          }
        },
      });
    } else {
      verbose &&
        console.log("Resolving and fingerprinting the local OSM file...");
      const fingerprintStarted = Date.now();
      const resolvedPath = realpathSync(resolve(file));
      const stat = statSync(resolvedPath, { bigint: true });
      if (!stat.isFile()) {
        throw new Error(
          `The OpenStreetMap source is not a file: ${resolvedPath}`,
        );
      }
      verbose && console.log(
        `Resolved ${formatBytes(Number(stat.size))} and fingerprinted it in ${
          prettyDuration(fingerprintStarted)
        }.`,
      );
      const cacheId = createOsmCacheId({
        kind: "local",
        path: resolvedPath,
        size: stat.size.toString(),
        mtimeNs: stat.mtimeNs.toString(),
      });
      await useProcessedOsmCache(table, {
        id: cacheId,
        enabled: options.cache ?? true,
        ttl: options.ttl,
        verbose,
        parameters,
        compute: () => processOsmFile(table, resolvedPath, parameters, verbose),
      });
    }
    verbose && console.log(
      `loadOpenStreetMap(): completed in ${prettyDuration(started)}.`,
    );
  } catch (error) {
    if (error instanceof SDAError) throw error;
    throw new SDAError({
      method: "loadOpenStreetMap()",
      parameters,
      query: "",
      cause: error,
    });
  }
}

function queueOverpassLoad(
  table: SimpleTable,
  bbox: BoundingBox,
  options: LoadOpenStreetMapOverpassOptions,
): void {
  bbox = normalizeBoundingBox(bbox);
  options = structuredClone(options);
  assertOptions(options, true);
  const endpoint = normalizeEndpoint(
    options.endpoint ?? DEFAULT_OVERPASS_ENDPOINT,
  );
  const filters = normalizeFilters(options.filters);
  const query = generateOverpassQuery(bbox, filters, options.timeout);
  const parameters = { bbox, options };

  queueOp(table, {
    kind: "barrier",
    method: "loadOpenStreetMap()",
    parameters,
    execute: () =>
      executeOverpassLoad(table, options, endpoint, query, parameters),
  });
}

async function executeOverpassLoad(
  table: SimpleTable,
  options: LoadOpenStreetMapOverpassOptions,
  endpoint: string,
  query: string,
  parameters: { [key: string]: unknown },
): Promise<void> {
  const started = Date.now();
  const verbose = options.verbose === true || table.sdb.cacheVerbose;
  verbose && console.log(
    `loadOpenStreetMap(): querying ${sanitizeOsmUrl(endpoint)}`,
  );
  try {
    const cacheId = createOsmCacheId({
      kind: "overpass",
      endpoint,
      query,
      queryGeneratorVersion: QUERY_GENERATOR_VERSION,
    });
    await useProcessedOsmCache(table, {
      id: cacheId,
      enabled: options.cache ?? true,
      ttl: options.ttl,
      verbose,
      parameters,
      compute: async () => {
        const body = new URLSearchParams({ data: query });
        const temporaryFile = await downloadOsmToTemporaryFile(endpoint, {
          suffix: ".osm",
          prefix: cacheId,
          request: {
            method: "POST",
            headers: {
              "accept-encoding": "gzip",
              "content-type": "application/x-www-form-urlencoded;charset=UTF-8",
              "user-agent":
                "simple-data-analysis-core (https://github.com/nshiab/simple-data-analysis-core)",
            },
            body,
          },
          retries: options.retries,
          retryDelay: options.retryDelay,
          timeout: options.timeout,
          overpass: true,
          verbose,
        });
        try {
          try {
            await assertSuccessfulOverpassResponse(temporaryFile);
          } catch (error) {
            const reason = error instanceof Error
              ? error.message
              : String(error);
            throw new Error(
              `${reason}\nNot retrying because the Overpass response was well-formed and reported a query error.\nNo invalid cached data was returned.`,
              { cause: error },
            );
          }
          await processOsmFile(table, temporaryFile, parameters, verbose);
        } finally {
          rmSync(temporaryFile, { force: true });
          verbose &&
            console.log("Removed the temporary raw Overpass download.");
        }
      },
    });
    verbose && console.log(
      `loadOpenStreetMap(): completed in ${prettyDuration(started)}.`,
    );
  } catch (error) {
    if (error instanceof SDAError) throw error;
    throw new SDAError({
      method: "loadOpenStreetMap()",
      parameters,
      query,
      cause: error,
    });
  }
}

async function processOsmFile(
  table: SimpleTable,
  file: string,
  parameters: { [key: string]: unknown },
  verbose: boolean,
): Promise<void> {
  verbose && console.log("Processing OSM data with Osmium...");
  const started = Date.now();
  try {
    await loadOsmFile(table, file, {
      method: "loadOpenStreetMap()",
      parameters,
    });
  } catch (error) {
    const cause = error instanceof SDAError ? error.cause : error;
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new Error(
      `${reason}\nNot retrying because Osmium or a downstream DuckDB operation rejected the source data.\nNo invalid cached data was returned.`,
      { cause: error },
    );
  }
  if (verbose) {
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
    const count = Number(data?.[0]?.count ?? 0);
    console.log(
      `Processed ${count.toLocaleString("en-US")} rows in ${
        prettyDuration(started)
      }.`,
    );
  }
}

async function assertSuccessfulOverpassResponse(file: string): Promise<void> {
  const contents = await Deno.readTextFile(file);
  const match = /<(remark|error)\b[^>]*>([\s\S]*?)(?:<\/\1\s*>|$)/i.exec(
    contents,
  );
  if (match === null) return;
  const message = match[2]
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 500);
  throw new Error(
    message.length === 0
      ? "The Overpass endpoint returned an error response."
      : `The Overpass endpoint returned an error response: ${message}`,
  );
}

export function generateOverpassQuery(
  bbox: BoundingBox,
  filters: string[],
  timeout?: number,
): string {
  const box = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const selections = filters.map((filter) => `nwr${filter}(${box});`);
  const selection = selections.length === 1
    ? selections[0]
    : `(${selections.join("")});`;
  return `[out:xml]${
    timeout === undefined ? "" : `[timeout:${timeout}]`
  };${selection}(._;>;);out body;`;
}

function normalizeBoundingBox(bbox: BoundingBox): BoundingBox {
  const normalized = structuredClone(bbox);
  for (const [name, value] of Object.entries(normalized)) {
    if (!Number.isFinite(value)) {
      throw new Error(
        `loadOpenStreetMap() bbox.${name} must be a finite number.`,
      );
    }
  }
  if (normalized.west < -180 || normalized.west > 180) {
    throw new Error(
      "loadOpenStreetMap() bbox.west must be between -180 and 180.",
    );
  }
  if (normalized.east < -180 || normalized.east > 180) {
    throw new Error(
      "loadOpenStreetMap() bbox.east must be between -180 and 180.",
    );
  }
  if (normalized.south < -90 || normalized.south > 90) {
    throw new Error(
      "loadOpenStreetMap() bbox.south must be between -90 and 90.",
    );
  }
  if (normalized.north < -90 || normalized.north > 90) {
    throw new Error(
      "loadOpenStreetMap() bbox.north must be between -90 and 90.",
    );
  }
  if (normalized.west >= normalized.east) {
    throw new Error(
      "loadOpenStreetMap() bbox.west must be less than bbox.east.",
    );
  }
  if (normalized.south >= normalized.north) {
    throw new Error(
      "loadOpenStreetMap() bbox.south must be less than bbox.north.",
    );
  }
  normalized.west = Object.is(normalized.west, -0) ? 0 : normalized.west;
  normalized.south = Object.is(normalized.south, -0) ? 0 : normalized.south;
  normalized.east = Object.is(normalized.east, -0) ? 0 : normalized.east;
  normalized.north = Object.is(normalized.north, -0) ? 0 : normalized.north;
  return normalized;
}

function normalizeFilters(
  filters: string | [string, string] | [string, string][],
): string[] {
  if (typeof filters === "string") {
    const filter = filters.trim();
    if (filter.length === 0) {
      throw new Error(
        "loadOpenStreetMap() filters must contain at least one non-empty filter fragment.",
      );
    }
    return [filter];
  }
  if (!Array.isArray(filters)) {
    throw new TypeError("loadOpenStreetMap() options.filters is required.");
  }
  const tuples = isFilterTuple(filters) ? [filters] : filters;
  const normalized = tuples.map(([key, value]) => {
    if (typeof key !== "string" || typeof value !== "string") {
      throw new TypeError(
        "loadOpenStreetMap() filter tuples must contain two strings.",
      );
    }
    if (key.length === 0) {
      throw new Error("loadOpenStreetMap() filter keys must not be empty.");
    }
    return `[${JSON.stringify(key)}=${JSON.stringify(value)}]`;
  });
  if (normalized.length === 0) {
    throw new Error(
      "loadOpenStreetMap() filters must contain at least one filter tuple.",
    );
  }
  return normalized;
}

function isFilterTuple(
  filters: [string, string] | [string, string][],
): filters is [string, string] {
  return filters.length === 2 && typeof filters[0] === "string" &&
    typeof filters[1] === "string";
}

function normalizeEndpoint(endpoint: string): string {
  try {
    return normalizeRemoteOsmUrl(endpoint);
  } catch {
    throw new Error(
      "loadOpenStreetMap() endpoint must be a valid HTTP or HTTPS URL.",
    );
  }
}

function assertOptions(
  options: CommonOptions & {
    filters?: string | [string, string] | [string, string][];
    endpoint?: string;
    timeout?: number;
  },
  overpass: boolean,
): void {
  const allowed = new Set([
    "cache",
    "ttl",
    "retries",
    "retryDelay",
    "verbose",
    ...(overpass ? ["filters", "endpoint", "timeout"] : []),
  ]);
  const unsupported = Object.keys(options).filter((key) => !allowed.has(key));
  if (unsupported.length > 0) {
    throw new Error(
      `loadOpenStreetMap() does not support ${
        unsupported.map((key) => `options.${key}`).join(", ")
      } for this source. Apply filtering and projection with normal table methods after loading.`,
    );
  }
  if (options.cache !== undefined && typeof options.cache !== "boolean") {
    throw new TypeError("loadOpenStreetMap() options.cache must be a boolean.");
  }
  if (options.verbose !== undefined && typeof options.verbose !== "boolean") {
    throw new TypeError(
      "loadOpenStreetMap() options.verbose must be a boolean.",
    );
  }
  if (
    options.ttl !== undefined &&
    (!Number.isFinite(options.ttl) || options.ttl < 0)
  ) {
    throw new Error(
      "loadOpenStreetMap() options.ttl must be a finite, non-negative number of seconds.",
    );
  }
  if (options.cache === false && options.ttl !== undefined) {
    throw new Error(
      "loadOpenStreetMap() options.cache cannot be false when options.ttl is set.",
    );
  }
  if (
    options.retries !== undefined &&
    (!Number.isInteger(options.retries) || options.retries < 0)
  ) {
    throw new Error(
      "loadOpenStreetMap() options.retries must be a non-negative integer.",
    );
  }
  if (
    options.retryDelay !== undefined &&
    (!Number.isFinite(options.retryDelay) || options.retryDelay < 0)
  ) {
    throw new Error(
      "loadOpenStreetMap() options.retryDelay must be a finite, non-negative number of seconds.",
    );
  }
  if (
    overpass && options.timeout !== undefined &&
    (!Number.isInteger(options.timeout) || options.timeout <= 0)
  ) {
    throw new Error(
      "loadOpenStreetMap() options.timeout must be a positive integer in seconds.",
    );
  }
}
