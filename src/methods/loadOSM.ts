import { createReadStream, rmSync } from "node:fs";
import SDAError from "../class/SDAError.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import loadOsmFile from "../helpers/loadOsmFile.ts";
import {
  createOsmCacheId,
  loadProcessedOsmCache,
  writeProcessedOsmCache,
} from "../helpers/osmCache.ts";
import { downloadOsmToTemporaryFile } from "../helpers/osmFiles.ts";
import queueOp from "../helpers/queueOp.ts";

const DEFAULT_OVERPASS_ENDPOINT = "https://overpass-api.de/api/interpreter";
const QUERY_GENERATOR_VERSION = "overpass-ql-v1";

type BoundingBox = {
  west: number;
  south: number;
  east: number;
  north: number;
};

type LoadOsmOptions = {
  filters: string | [string, string] | [string, string][];
  endpoint?: string;
  timeout?: number;
  cache?: boolean;
};

export default function loadOSM(
  table: SimpleTable,
  bbox: BoundingBox,
  options: LoadOsmOptions,
): void {
  bbox = normalizeBoundingBox(bbox);
  options = structuredClone(options);
  const endpoint = normalizeEndpoint(
    options.endpoint ?? DEFAULT_OVERPASS_ENDPOINT,
  );
  const filters = normalizeFilters(options.filters);
  assertTimeout(options.timeout);
  const query = generateOverpassQuery(bbox, filters, options.timeout);
  const parameters = { bbox, options };

  queueOp(table, {
    kind: "barrier",
    method: "loadOSM()",
    parameters,
    execute: () =>
      executeLoadOSM(table, bbox, options, endpoint, query, parameters),
  });
}

async function executeLoadOSM(
  table: SimpleTable,
  bbox: BoundingBox,
  options: LoadOsmOptions,
  endpoint: string,
  query: string,
  parameters: { [key: string]: unknown },
): Promise<void> {
  try {
    const cacheEnabled = options.cache ?? true;
    const cacheId = createOsmCacheId({
      endpoint,
      bbox,
      query,
      queryGeneratorVersion: QUERY_GENERATOR_VERSION,
    });
    if (
      cacheEnabled &&
      await loadProcessedOsmCache(table, cacheId, parameters)
    ) {
      return;
    }

    const timeoutSignal = options.timeout === undefined
      ? undefined
      : AbortSignal.timeout(options.timeout * 1000);
    const body = new URLSearchParams({ data: query });
    const start = Date.now();
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
        signal: timeoutSignal,
      },
    });

    try {
      await assertSuccessfulOverpassResponse(temporaryFile);
      await loadOsmFile(table, temporaryFile, {
        method: "loadOSM()",
        parameters,
      });
      if (cacheEnabled) {
        await writeProcessedOsmCache(
          table,
          cacheId,
          parameters,
          Date.now() - start,
        );
      }
    } finally {
      rmSync(temporaryFile, { force: true });
    }
  } catch (error) {
    if (error instanceof SDAError) {
      throw error;
    }
    throw new SDAError({
      method: "loadOSM()",
      parameters,
      query,
      cause: error,
    });
  }
}

async function assertSuccessfulOverpassResponse(file: string): Promise<void> {
  const stream = createReadStream(file, { encoding: "utf-8" });
  let buffer = "";
  let errorTag: "remark" | "error" | undefined;

  for await (const chunk of stream) {
    buffer += String(chunk);
    if (errorTag === undefined) {
      const openingTag = /<(remark|error)\b[^>]*>/i.exec(buffer);
      if (openingTag === null) {
        buffer = buffer.slice(-4096);
        continue;
      }
      errorTag = openingTag[1].toLowerCase() === "remark" ? "remark" : "error";
      buffer = buffer.slice(openingTag.index + openingTag[0].length);
    }

    const closingTag = new RegExp(`</${errorTag}\\s*>`, "i").exec(buffer);
    if (closingTag !== null) {
      throwOverpassResponseError(buffer.slice(0, closingTag.index));
    }
    if (buffer.length >= 4096) {
      throwOverpassResponseError(buffer.slice(0, 4096));
    }
  }

  if (errorTag !== undefined) {
    throwOverpassResponseError(buffer);
  }
}

function throwOverpassResponseError(contents: string): never {
  const message = contents
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
      throw new Error(`loadOSM() bbox.${name} must be a finite number.`);
    }
  }
  if (normalized.west < -180 || normalized.west > 180) {
    throw new Error("loadOSM() bbox.west must be between -180 and 180.");
  }
  if (normalized.east < -180 || normalized.east > 180) {
    throw new Error("loadOSM() bbox.east must be between -180 and 180.");
  }
  if (normalized.south < -90 || normalized.south > 90) {
    throw new Error("loadOSM() bbox.south must be between -90 and 90.");
  }
  if (normalized.north < -90 || normalized.north > 90) {
    throw new Error("loadOSM() bbox.north must be between -90 and 90.");
  }
  if (normalized.west >= normalized.east) {
    throw new Error("loadOSM() bbox.west must be less than bbox.east.");
  }
  if (normalized.south >= normalized.north) {
    throw new Error("loadOSM() bbox.south must be less than bbox.north.");
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
        "loadOSM() filters must contain at least one non-empty filter fragment.",
      );
    }
    return [filter];
  }

  const tuples = isFilterTuple(filters) ? [filters] : filters;
  const normalized = tuples.map(([key, value]) => {
    if (key.length === 0) {
      throw new Error("loadOSM() filter keys must not be empty.");
    }
    return `[${JSON.stringify(key)}=${JSON.stringify(value)}]`;
  });
  if (
    normalized.length === 0
  ) {
    throw new Error(
      "loadOSM() filters must contain at least one filter tuple.",
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
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    throw new Error("loadOSM() endpoint must be a valid HTTP or HTTPS URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("loadOSM() endpoint must be an HTTP or HTTPS URL.");
  }
  return url.toString();
}

function assertTimeout(timeout: number | undefined): void {
  if (
    timeout !== undefined &&
    (!Number.isInteger(timeout) || timeout <= 0)
  ) {
    throw new Error("loadOSM() timeout must be a positive integer in seconds.");
  }
}
