import crypto from "node:crypto";
import { createWriteStream, mkdirSync, rmSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import type SimpleTable from "../class/SimpleTable.ts";
import SDAError from "../class/SDAError.ts";
import extractZipEntryToFile from "../helpers/extractZipEntryToFile.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queueOp from "../helpers/queueOp.ts";
import queryDB from "../helpers/queryDB.ts";
import { loadDataQuery } from "./loadData.ts";
import {
  createStatCanCacheId,
  useStatCanCache,
} from "../helpers/statCanCache.ts";

type LoadStatCanOptions = {
  lang?: "en" | "fr";
  cache?: boolean;
  ttl?: number;
};

type StatCanDownloadResponse = {
  status?: unknown;
  object?: unknown;
};

const DOWNLOAD_ENDPOINT =
  "https://www150.statcan.gc.ca/t1/wds/rest/getFullTableDownloadCSV";

// Adapted from getStatCanTable() in @nshiab/journalism-web-scraping.

export default function loadStatCanData(
  table: SimpleTable,
  pid: string,
  options: LoadStatCanOptions = {},
): void {
  pid = normalizeStatCanPid(pid);
  options = structuredClone(options);
  assertOptions(options);
  const lang = options.lang ?? "en";
  const parameters = { pid, options };

  queueOp(table, {
    kind: "barrier",
    method: "loadStatCanData()",
    parameters,
    execute: () =>
      executeLoadStatCanData(table, pid, lang, options, parameters),
  });
}

async function executeLoadStatCanData(
  table: SimpleTable,
  pid: string,
  lang: "en" | "fr",
  options: LoadStatCanOptions,
  parameters: { [key: string]: unknown },
): Promise<void> {
  const cacheEnabled = options.cache ?? true;
  const cacheId = createStatCanCacheId(pid, lang);
  try {
    await useStatCanCache(
      table,
      cacheId,
      cacheEnabled,
      options.ttl,
      parameters,
      async () => {
        const downloadUrl = await getDownloadUrl(pid, lang);
        const temporaryDirectory = ".sda-cache/tmp";
        mkdirSync(temporaryDirectory, { recursive: true });
        const prefix = `${cacheId}.${crypto.randomUUID()}`;
        const archive = `${temporaryDirectory}/${prefix}.zip`;
        const csv = `${temporaryDirectory}/${prefix}.csv`;

        try {
          await downloadToFile(downloadUrl, archive);
          await extractZipEntryToFile(archive, `${pid}.csv`, csv);
          await queryDB(
            table,
            loadDataQuery(table.name, [csv], { fileType: "csv" }),
            mergeOptions(table, {
              table: table.name,
              method: "loadStatCanData()",
              parameters,
            }),
          );
        } finally {
          rmSync(archive, { force: true });
          rmSync(csv, { force: true });
        }
      },
    );
  } catch (error) {
    if (error instanceof SDAError) {
      throw error;
    }
    throw new SDAError({
      method: "loadStatCanData()",
      parameters,
      query: "",
      cause: error,
    });
  }
}

async function getDownloadUrl(
  pid: string,
  lang: "en" | "fr",
): Promise<string> {
  const url = `${DOWNLOAD_ENDPOINT}/${pid}/${lang}`;
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "simple-data-analysis-core (https://github.com/nshiab/simple-data-analysis-core)",
    },
  });
  if (!response.ok) {
    throw await httpError(
      "retrieve the Statistics Canada download URL",
      url,
      response,
    );
  }

  const result = await response.json() as StatCanDownloadResponse;
  if (result.status !== "SUCCESS" || typeof result.object !== "string") {
    throw new Error(
      `Statistics Canada did not return a CSV download URL for PID ${pid}.`,
    );
  }
  const downloadUrl = new URL(result.object);
  if (downloadUrl.protocol !== "http:" && downloadUrl.protocol !== "https:") {
    throw new Error(
      `Statistics Canada returned an invalid CSV download URL for PID ${pid}.`,
    );
  }
  return downloadUrl.href;
}

async function downloadToFile(url: string, file: string): Promise<void> {
  const response = await fetch(url, {
    headers: {
      "user-agent":
        "simple-data-analysis-core (https://github.com/nshiab/simple-data-analysis-core)",
    },
  });
  if (!response.ok) {
    throw await httpError("download Statistics Canada data", url, response);
  }
  if (response.body === null) {
    throw new Error(
      `Could not download Statistics Canada data from ${
        JSON.stringify(url)
      }: the response body is empty.`,
    );
  }
  try {
    await pipeline(
      Readable.fromWeb(response.body),
      createWriteStream(file, { flags: "wx" }),
    );
  } catch (error) {
    rmSync(file, { force: true });
    throw error;
  }
}

async function httpError(
  action: string,
  url: string,
  response: Response,
): Promise<Error> {
  const responseText = (await response.text()).slice(0, 500).trim();
  return new Error(
    `Could not ${action} from ${
      JSON.stringify(url)
    }: HTTP ${response.status} ${response.statusText}${
      responseText.length > 0 ? `\n${responseText}` : ""
    }`,
  );
}

export function normalizeStatCanPid(pid: string): string {
  if (typeof pid !== "string") {
    throw new TypeError("loadStatCanData() pid must be a string.");
  }
  const normalized = pid.replaceAll("-", "");
  if (!/^\d{8}(?:\d{2})?$/.test(normalized)) {
    throw new Error(
      'loadStatCanData() pid must contain 8 or 10 digits, optionally formatted like "36-10-0402-01".',
    );
  }
  return normalized.slice(0, 8);
}

function assertOptions(options: LoadStatCanOptions): void {
  if (
    options.lang !== undefined && options.lang !== "en" && options.lang !== "fr"
  ) {
    throw new Error('loadStatCanData() options.lang must be "en" or "fr".');
  }
  if (options.cache !== undefined && typeof options.cache !== "boolean") {
    throw new TypeError("loadStatCanData() options.cache must be a boolean.");
  }
  if (
    options.ttl !== undefined &&
    (!Number.isFinite(options.ttl) || options.ttl < 0)
  ) {
    throw new Error(
      "loadStatCanData() options.ttl must be a finite, non-negative number of seconds.",
    );
  }
}
