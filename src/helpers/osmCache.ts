import type SimpleTable from "../class/SimpleTable.ts";
import fileCache, { createFileCacheId } from "./fileCache.ts";
import mergeOptions from "./mergeOptions.ts";
import parseValue from "./parseValue.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

const CACHE_DIRECTORY = ".sda-cache/osm";
const OSM_CACHE_FORMAT_VERSION = "osm-geoparquet-v1";

export function createOsmCacheId(identity: {
  endpoint: string;
  bbox: { west: number; south: number; east: number; north: number };
  query: string;
  queryGeneratorVersion: string;
}): string {
  return createFileCacheId("osm", identity);
}

export async function useProcessedOsmCache(
  table: SimpleTable,
  id: string,
  enabled: boolean,
  parameters: { [key: string]: unknown },
  compute: () => Promise<void>,
): Promise<void> {
  await fileCache(table, {
    directory: CACHE_DIRECTORY,
    enabled,
    extension: "geoparquet",
    formatVersion: OSM_CACHE_FORMAT_VERSION,
    id,
    method: "loadOSM()",
    load: async (file) => {
      await queryDB(
        table,
        `INSTALL spatial;
        LOAD spatial;
        SET geometry_always_xy = true;
        CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS
        SELECT * FROM read_parquet(${parseValue(file)});`,
        mergeOptions(table, {
          table: table.name,
          method: "loadOSM()",
          parameters,
        }),
      );
      table.sdb.spatialLoaded = true;
    },
    compute,
    write: async (file) => {
      await queryDB(
        table,
        `COPY ${quoteIdentifier(table.name)} TO ${parseValue(file)}
        WITH (FORMAT PARQUET);`,
        mergeOptions(table, {
          table: table.name,
          method: "loadOSM()",
          parameters,
        }),
      );
    },
  });
}
