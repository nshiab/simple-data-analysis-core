import { readFileSync, unlinkSync, writeFileSync } from "node:fs";
import type SimpleDB from "../class/SimpleDB.ts";

export default function cleanCache(sdb: SimpleDB, log: (message: string) => void = console.log) {
  if (sdb.cacheSourcesUsed.length > 0) {
    const cacheSources: unknown = JSON.parse(readFileSync(".sda-cache/sources.json", "utf8"));
    if (cacheSources === null || typeof cacheSources !== "object" || Array.isArray(cacheSources)) {
      throw new Error("Invalid SDA table cache metadata.");
    }
    for (const [cacheId, source] of Object.entries(cacheSources)) {
      if (!isFileSource(source)) throw new Error("Invalid SDA cache file metadata.");
      if (!sdb.cacheSourcesUsed.includes(cacheId)) {
        if (source.file !== null) {
          if (sdb.cacheVerbose) {
            log(`Removing unused file from cache: ${source.file}`);
          }
          unlinkSync(source.file);
        }
        Reflect.deleteProperty(cacheSources, cacheId);
      }
    }
    writeFileSync(".sda-cache/sources.json", JSON.stringify(cacheSources));
  }
}

function isFileSource(value: unknown): value is { file: string | null } {
  return (
    value !== null &&
    typeof value === "object" &&
    "file" in value &&
    (value.file === null || typeof value.file === "string")
  );
}
