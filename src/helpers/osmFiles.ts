import crypto from "node:crypto";
import { createWriteStream, mkdirSync } from "node:fs";
import { rm } from "node:fs/promises";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import prettyDuration from "./prettyDuration.ts";

export type OsmFileSuffix = ".osm" | ".osm.pbf";

type RetryFailure = {
  reason: string;
  retryable: boolean;
  explanation: string;
  retryAfterSeconds?: number;
};

export function getOsmFileSuffix(file: string): OsmFileSuffix | null {
  const comparable = isRemoteOsmUrl(file) ? new URL(file).pathname : file;
  const lower = comparable.toLowerCase();
  if (lower.endsWith(".osm.pbf")) return ".osm.pbf";
  if (lower.endsWith(".osm")) return ".osm";
  return null;
}

export function isRemoteOsmUrl(file: string): boolean {
  try {
    const protocol = new URL(file).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

export function normalizeRemoteOsmUrl(file: string): string {
  let url: URL;
  try {
    url = new URL(file);
  } catch {
    throw new Error(
      "loadOpenStreetMap() remote sources must be valid HTTP or HTTPS URLs.",
    );
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(
      "loadOpenStreetMap() remote sources must use an HTTP or HTTPS URL.",
    );
  }
  return url.href;
}

export function sanitizeOsmUrl(source: string): string {
  let url: URL;
  try {
    url = new URL(source);
  } catch {
    return source;
  }
  url.username = "";
  url.password = "";
  for (const key of [...url.searchParams.keys()]) {
    if (
      /(?:api[-_]?key|auth|credential|password|secret|signature|token)/i.test(
        key,
      )
    ) {
      url.searchParams.set(key, "[REDACTED]");
    }
  }
  return url.href;
}

export async function downloadOsmToTemporaryFile(
  url: string,
  options: {
    suffix: OsmFileSuffix;
    prefix?: string;
    request?: RequestInit;
    retries?: number;
    retryDelay?: number;
    timeout?: number;
    overpass?: boolean;
    verbose?: boolean;
    wait?: (milliseconds: number) => Promise<void>;
  },
): Promise<string> {
  const temporaryDirectory = ".sda-cache/tmp";
  mkdirSync(temporaryDirectory, { recursive: true });
  const prefix = options.prefix === undefined ? "remote" : options.prefix;
  const retries = options.retries ?? 3;
  const retryDelay = options.retryDelay ?? 5;
  const totalAttempts = retries + 1;
  const sanitizedSource = sanitizeOsmUrl(url);
  const wait = options.wait ?? waitFor;
  let totalDelay = 0;
  let lastFailure: RetryFailure | undefined;

  for (let attempt = 1; attempt <= totalAttempts; attempt++) {
    const temporaryFile =
      `${temporaryDirectory}/${prefix}.${crypto.randomUUID()}${options.suffix}`;
    const start = Date.now();
    options.verbose && console.log(
      `${
        options.overpass ? "Querying Overpass" : "Downloading OSM data"
      } (attempt ${attempt} of ${totalAttempts})...`,
    );

    try {
      const response = await fetchWithTimeout(
        url,
        options.request,
        options.timeout,
      );
      if (!response.ok) {
        const failure = classifyHttpFailure(
          response,
          options.overpass ?? false,
        );
        if (!failure.retryable) {
          const responseText = (await response.text()).slice(0, 500).trim();
          if (responseText.length > 0) {
            failure.reason += ` Response: ${responseText}`;
          }
        } else {
          await response.body?.cancel();
        }
        throw failure;
      }
      if (response.body === null) {
        throw {
          reason: "The response body was empty.",
          retryable: true,
          explanation:
            "an empty response can be caused by an interrupted transfer",
        } satisfies RetryFailure;
      }

      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(temporaryFile, { flags: "wx" }),
      );
      if (options.verbose) {
        const size = (await Deno.stat(temporaryFile)).size;
        console.log(
          `${options.overpass ? "Received" : "Downloaded"} ${
            formatBytes(size)
          } in ${prettyDuration(start)}.`,
        );
      }
      return temporaryFile;
    } catch (error) {
      await rm(temporaryFile, { force: true }).catch(() => undefined);
      lastFailure = isRetryFailure(error)
        ? error
        : classifyFetchFailure(error, options.timeout);
      const canRetry = lastFailure.retryable && attempt < totalAttempts;
      logAttemptFailure(
        sanitizedSource,
        attempt,
        totalAttempts,
        lastFailure,
        canRetry,
      );
      if (!canRetry) {
        throw new Error(
          finalRequestError(attempt, retries, totalDelay, lastFailure),
          { cause: error },
        );
      }

      const calculatedDelay = retryDelay * 2 ** (attempt - 1);
      const delay = Math.max(
        calculatedDelay,
        lastFailure.retryAfterSeconds ?? 0,
      );
      logRetryDelay(
        delay,
        calculatedDelay,
        lastFailure.retryAfterSeconds,
        attempt,
        retries,
        retryDelay,
      );
      totalDelay += delay;
      await wait(delay * 1000);
    }
  }

  throw new Error(
    finalRequestError(
      totalAttempts,
      retries,
      totalDelay,
      lastFailure ?? {
        reason: "Unknown request failure.",
        retryable: false,
        explanation: "the failure could not be classified",
      },
    ),
  );
}

async function fetchWithTimeout(
  url: string,
  request: RequestInit | undefined,
  timeout: number | undefined,
): Promise<Response> {
  const timeoutSignal = timeout === undefined
    ? undefined
    : AbortSignal.timeout(timeout * 1000);
  const requestSignal = request?.signal ?? undefined;
  const signal = timeoutSignal === undefined
    ? requestSignal
    : requestSignal === undefined
    ? timeoutSignal
    : AbortSignal.any([timeoutSignal, requestSignal]);
  return await fetch(url, { ...request, signal });
}

function classifyHttpFailure(
  response: Response,
  overpass: boolean,
): RetryFailure {
  const status = `HTTP ${response.status}${
    response.statusText.length > 0 ? ` ${response.statusText}` : ""
  }`;
  const retryAfterSeconds = parseRetryAfter(
    response.headers.get("retry-after"),
  );
  if (response.status === 408) {
    return {
      reason: status,
      retryable: true,
      explanation: "HTTP 408 indicates a transient request timeout",
      retryAfterSeconds,
    };
  }
  if (response.status === 429) {
    return {
      reason: status,
      retryable: true,
      explanation: "HTTP 429 indicates temporary rate limiting",
      retryAfterSeconds,
    };
  }
  if (response.status >= 500 && response.status <= 599) {
    return {
      reason: status,
      retryable: true,
      explanation: "it is a server error",
      retryAfterSeconds,
    };
  }
  if (overpass && response.status === 406) {
    return {
      reason: status,
      retryable: true,
      explanation:
        "Overpass public instances use HTTP 406 for temporary resource limits",
      retryAfterSeconds,
    };
  }
  return {
    reason: status,
    retryable: false,
    explanation:
      `HTTP ${response.status} is not considered a transient failure`,
  };
}

function classifyFetchFailure(
  error: unknown,
  timeout: number | undefined,
): RetryFailure {
  const message = error instanceof Error ? error.message : String(error);
  const timedOut = error instanceof DOMException &&
    (error.name === "TimeoutError" || error.name === "AbortError") &&
    timeout !== undefined;
  return {
    reason: timedOut
      ? `The request timed out after ${timeout} seconds.`
      : message,
    retryable: true,
    explanation: timedOut
      ? "a configured request timeout is retryable"
      : "fetch and transfer errors are treated as transient network failures",
  };
}

function isRetryFailure(error: unknown): error is RetryFailure {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { [key: string]: unknown };
  return typeof candidate.reason === "string" &&
    typeof candidate.retryable === "boolean" &&
    typeof candidate.explanation === "string";
}

function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

function logAttemptFailure(
  source: string,
  attempt: number,
  totalAttempts: number,
  failure: RetryFailure,
  canRetry: boolean,
): void {
  console.log(
    `loadOpenStreetMap(): request attempt ${attempt} of ${totalAttempts} failed.\n` +
      `Source: ${source}\n` +
      `Reason: ${failure.reason}\n` +
      `${
        canRetry
          ? `This failure is retryable because ${failure.explanation}.`
          : `Not retrying because ${
            failure.retryable
              ? totalAttempts === 1
                ? "no retries were configured"
                : "the configured retries have been exhausted"
              : failure.explanation
          }.`
      }`,
  );
}

function logRetryDelay(
  delay: number,
  calculatedDelay: number,
  retryAfter: number | undefined,
  attempt: number,
  retries: number,
  retryDelay: number,
): void {
  if (retryAfter !== undefined && retryAfter > calculatedDelay) {
    console.log(
      `Retrying in ${
        formatSeconds(delay)
      } because the server returned Retry-After: ${retryAfter}.\n` +
        `The calculated retry delay was ${
          formatSeconds(calculatedDelay)
        }; the longer server-requested delay is being used.`,
    );
    return;
  }
  console.log(
    `Retrying in ${
      formatSeconds(delay)
    } (retry ${attempt} of ${retries}; configured base delay: ${
      formatSeconds(retryDelay)
    }).`,
  );
}

function finalRequestError(
  attempts: number,
  retries: number,
  totalDelay: number,
  failure: RetryFailure,
): string {
  const exhausted = failure.retryable && attempts === retries + 1;
  return `loadOpenStreetMap(): request failed after ${attempts} ${
    attempts === 1 ? "attempt" : "attempts"
  }.\n${
    exhausted
      ? retries === 0
        ? "No retries were configured."
        : `All ${retries} configured ${
          retries === 1 ? "retry was" : "retries were"
        } exhausted.`
      : "No further retry was attempted because the failure is nonretryable."
  }\nTotal retry delay: ${formatSeconds(totalDelay)}.\n` +
    `Last failure: ${failure.reason}\n` +
    `No further retry occurred because ${
      exhausted
        ? retries === 0
          ? "no retries were configured"
          : "the configured retries were exhausted"
        : failure.explanation
    }.\n` +
    "No invalid cached data was returned.";
}

function formatSeconds(seconds: number): string {
  return `${seconds} ${seconds === 1 ? "second" : "seconds"}`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} ${bytes === 1 ? "byte" : "bytes"}`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  let unit = units[0];
  for (const candidate of units) {
    value /= 1024;
    unit = candidate;
    if (value < 1024) break;
  }
  return `${value.toFixed(1)} ${unit}`;
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
