import type SimpleDB from "../class/SimpleDB.ts";
import type { IndexDefinition } from "./indexDefinitions.ts";

export default function getDbIndexes(
  sdb: SimpleDB,
): Record<string, IndexDefinition[]> {
  return Object.fromEntries(
    sdb.getTables().filter((table) => table.indexes.length > 0)
      .map((table) => [table.name, structuredClone(table.indexes)]),
  );
}
