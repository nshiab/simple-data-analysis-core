import { readFileSync } from "node:fs";
import type { TableGenerationId } from "./tableGeneration.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";
import type { CacheTableDependency } from "./cacheTableDependencies.ts";
import { validateIndexes } from "./readDbMetadata.ts";

export type CacheSource = {
  file: string | null;
  creation: number;
  duration: number;
  geo: boolean;
  entryGeneration?: TableGenerationId | null;
  generationId?: TableGenerationId;
  indexes?: IndexDefinition[];
  formatVersion?: string;
  codeHash?: string;
  inputHashes?: string[];
  tableDependencies?: CacheTableDependency[];
};

export type CacheSources = {
  [key: string]: CacheSource;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

function isCacheSource(value: unknown): value is CacheSource {
  if (!isRecord(value)) return false;
  if (value.indexes !== undefined) validateIndexes({ source: value.indexes });
  return (
    (value.file === null || typeof value.file === "string") &&
    typeof value.creation === "number" &&
    typeof value.duration === "number" &&
    typeof value.geo === "boolean" &&
    (value.entryGeneration === undefined ||
      value.entryGeneration === null ||
      typeof value.entryGeneration === "string") &&
    (value.generationId === undefined || typeof value.generationId === "string") &&
    (value.formatVersion === undefined || typeof value.formatVersion === "string") &&
    (value.codeHash === undefined || typeof value.codeHash === "string") &&
    (value.inputHashes === undefined ||
      (isArray(value.inputHashes) &&
        value.inputHashes.every((hash) => typeof hash === "string"))) &&
    (value.tableDependencies === undefined ||
      (isArray(value.tableDependencies) &&
        value.tableDependencies.every(
          (dependency) =>
            isRecord(dependency) &&
            typeof dependency.tableName === "string" &&
            typeof dependency.generationId === "string",
        )))
  );
}

/** Reads persisted table-cache metadata, validating JSON before it is used. */
export default function readCacheSources(path: string): CacheSources {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(value)) throw new Error("Invalid SDA table cache metadata.");
  const sources: [string, CacheSource][] = [];
  for (const [id, source] of Object.entries(value)) {
    if (!isCacheSource(source))
      throw new Error(`Invalid SDA table cache entry ${JSON.stringify(id)}.`);
    sources.push([id, source]);
  }
  return Object.fromEntries(sources);
}
