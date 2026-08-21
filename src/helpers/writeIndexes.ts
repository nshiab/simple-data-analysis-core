import { existsSync, rmSync, writeFileSync } from "node:fs";
import type { SimpleDB } from "../index.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";

export default function writeIndexes(
  simpleDB: SimpleDB,
  extension: string,
  file: string,
) {
  const allIndexes: { [key: string]: IndexDefinition[] } = {};
  for (const table of simpleDB.getTables()) {
    if (table.indexes.length > 0) {
      allIndexes[table.name] = table.indexes;
    }
  }
  const allIndexesFile = `${file.replace(`.${extension}`, "")}_indexes.json`;
  if (existsSync(allIndexesFile)) {
    rmSync(allIndexesFile);
  }
  if (Object.keys(allIndexes).length > 0) {
    writeFileSync(allIndexesFile, JSON.stringify(allIndexes));
  }
}
