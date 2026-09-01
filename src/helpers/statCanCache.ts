import type SimpleTable from "../class/SimpleTable.ts";
import fileCache, { createFileCacheId } from "./fileCache.ts";
import mergeOptions from "./mergeOptions.ts";
import parseValue from "./parseValue.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

const CACHE_DIRECTORY = ".sda-cache/statcan";
const CACHE_FORMAT_VERSION = "statcan-parquet-v1";

export function createStatCanCacheId(pid: string, lang: "en" | "fr"): string {
  return createFileCacheId("statcan", [CACHE_FORMAT_VERSION, pid, lang]);
}

export async function useStatCanCache(
  table: SimpleTable,
  id: string,
  enabled: boolean,
  ttl: number | undefined,
  parameters: { [key: string]: unknown },
  compute: () => Promise<void>,
): Promise<void> {
  await fileCache(table, {
    directory: CACHE_DIRECTORY,
    enabled,
    extension: "parquet",
    formatVersion: CACHE_FORMAT_VERSION,
    id,
    method: "loadStatCanData()",
    ttl,
    load: async (file) => {
      await queryDB(
        table,
        `CREATE OR REPLACE TABLE ${quoteIdentifier(table.name)} AS
        SELECT * FROM read_parquet(${parseValue(file)});`,
        mergeOptions(table, {
          table: table.name,
          method: "loadStatCanData()",
          parameters,
        }),
      );
    },
    compute,
    write: async (file) => {
      await queryDB(
        table,
        `COPY ${quoteIdentifier(table.name)} TO ${parseValue(file)}
        WITH (FORMAT PARQUET);`,
        mergeOptions(table, {
          table: table.name,
          method: "loadStatCanData()",
          parameters,
        }),
      );
    },
  });
}
