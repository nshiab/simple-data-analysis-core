import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import type SimpleTable from "../class/SimpleTable.ts";
import crypto from "node:crypto";
import flushAllTables from "../helpers/flushAllTables.ts";
import formatDate from "../helpers/formatDate.ts";
import prettyDuration from "../helpers/prettyDuration.ts";
import serializeCacheInputs from "../helpers/serializeCacheInputs.ts";
import { restoreTableGeneration } from "../helpers/tableGeneration.ts";

type cacheSources = {
  [key: string]: {
    file: string | null;
    creation: number;
    duration: number;
    geo: boolean;
    generationId?: string;
  };
};

export default async function cache(
  table: SimpleTable,
  compute: () => void | Promise<void>,
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
  let cacheSources: cacheSources = {};
  if (existsSync(cacheSourcesPath)) {
    cacheSources = JSON.parse(readFileSync(cacheSourcesPath, "utf-8"));
  }

  const functionBody = compute.toString();
  const serializedInputs = options.inputs === undefined
    ? undefined
    : serializeCacheInputs(options.inputs, table);
  const hasInputs = options.inputs !== undefined && options.inputs.length > 0;
  const hash = crypto
    .createHash("sha256")
    .update(
      hasInputs
        ? JSON.stringify([
          "sda-cache-inputs-v2",
          table.name,
          functionBody,
          serializedInputs,
        ])
        : table.name + options.toString() + functionBody,
    )
    .digest("hex");
  const id = `${table.name}.${hash}`;

  const cache = cacheSources[id];
  const now = Date.now();

  if (cache === undefined) {
    options.verbose &&
      console.log(`Nothing in cache. Running and storing in cache.`);
    await runAndWrite(
      table,
      compute,
      cacheSources,
      cacheSourcesPath,
      cachePath,
      id,
    );
  } else if (
    cache &&
    typeof options.ttl === "number" &&
    now - cache.creation > options.ttl * 1000
  ) {
    options.verbose &&
      console.log(
        `Found in cache.\nttl of ${
          prettyDuration(0, { end: options.ttl * 1000 })
        } has expired.\nThe creation date is ${
          formatDate(
            new Date(cache.creation),
            "Month DD, YYYY, at HH:MM period",
          )
        }.\nIt's is ${
          prettyDuration(cache.creation, { end: now })
        } ago.\nRunning and storing in cache.`,
      );
    await runAndWrite(
      table,
      compute,
      cacheSources,
      cacheSourcesPath,
      cachePath,
      id,
    );
  } else {
    options.verbose &&
      console.log(`Found in cache.`);
    if (typeof options.ttl === "number") {
      const ttlLimit = new Date(cache.creation + options.ttl * 1000);
      (options.verbose) &&
        console.log(
          `ttl of ${
            prettyDuration(0, { end: options.ttl * 1000 })
          } has not expired.\nThe creation date is ${
            formatDate(
              new Date(cache.creation),
              "Month DD, YYYY, at HH:MM period",
            )
          }.\nThere are ${prettyDuration(now, { end: ttlLimit })} left.`,
        );
    }
    // Cached-file loaders are sync builders, so cache() must flush their
    // queued work before it resolves.
    if (cache.file === null) {
      console.log("No data in cache. Nothing to load.");
    } else if (cache.geo) {
      const start = Date.now();
      table.loadGeoData(cache.file);
      await flushAllTables(table.sdb);
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
    } else {
      const start = Date.now();
      table.loadData(cache.file);
      await flushAllTables(table.sdb);
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

async function runAndWrite(
  table: SimpleTable,
  compute: () => void | Promise<void>,
  cacheSources: cacheSources,
  cacheSourcesPath: string,
  cachePath: string,
  id: string,
) {
  const start = Date.now();
  await compute();
  // run() only queues the sync builders in the user's callback; the actual
  // computation happens at the flush, so it must be included in the timing
  // that decides how much the cache saves on later hits.
  await flushAllTables(table.sdb);
  const end = Date.now();
  const duration = end - start;
  const generationId = crypto.randomUUID();
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
      generationId,
    };
  } else {
    const types = await table.getTypes();
    const geometriesColumns = Object.values(types).filter(
      (d) => d.toLowerCase().includes("geometry"),
    ).length;
    if (geometriesColumns > 0) {
      const file = `${cachePath}/${id}.geoparquet`;
      const writeStart = Date.now();
      await table.writeGeoData(file);
      cacheSources[id] = {
        creation: Date.now(),
        duration,
        file,
        geo: true,
        generationId,
      };
      const writeEnd = Date.now();
      table.sdb.cacheVerbose &&
        console.log(
          `Wrote in cache in ${
            prettyDuration(writeStart, { end: writeEnd })
          }.\n`,
        );
      table.sdb.cacheTimeWriting += writeEnd - writeStart;
      if (table.sdb.cacheSourcesUsed.indexOf(id) < 0) {
        table.sdb.cacheSourcesUsed.push(id);
      }
    } else {
      const file = `${cachePath}/${id}.parquet`;
      const writeStart = Date.now();
      await table.writeData(file);
      const writeEnd = Date.now();
      table.sdb.cacheVerbose &&
        console.log(
          `Wrote in cache in ${
            prettyDuration(writeStart, { end: writeEnd })
          }.\n`,
        );
      table.sdb.cacheTimeWriting += writeEnd - writeStart;
      cacheSources[id] = {
        creation: Date.now(),
        duration,
        file,
        geo: false,
        generationId,
      };
      if (table.sdb.cacheSourcesUsed.indexOf(id) < 0) {
        table.sdb.cacheSourcesUsed.push(id);
      }
    }
  }

  writeFileSync(cacheSourcesPath, JSON.stringify(cacheSources));
  restoreTableGeneration(table, generationId);
}

function restoreCachedGeneration(
  table: SimpleTable,
  cache: cacheSources[string],
  cacheSources: cacheSources,
  cacheSourcesPath: string,
): void {
  if (cache.generationId === undefined) {
    cache.generationId = crypto.randomUUID();
    writeFileSync(cacheSourcesPath, JSON.stringify(cacheSources));
  }
  restoreTableGeneration(table, cache.generationId);
}
