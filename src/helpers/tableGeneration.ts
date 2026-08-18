import crypto from "node:crypto";
import type SimpleTable from "../class/SimpleTable.ts";

declare const tableGenerationIdBrand: unique symbol;

/** An opaque identifier for one in-process or cached table generation. */
export type TableGenerationId = string & {
  readonly [tableGenerationIdBrand]: true;
};

const generations = new WeakMap<SimpleTable, TableGenerationId>();

/** Creates a new table generation identifier. */
export function createTableGenerationId(): TableGenerationId {
  return crypto.randomUUID() as TableGenerationId;
}

/** Returns the current in-process generation identifier for a table. */
export function getTableGeneration(table: SimpleTable): TableGenerationId {
  let generation = generations.get(table);
  if (generation === undefined) {
    generation = createTableGenerationId();
    generations.set(table, generation);
  }
  return generation;
}

/** Gives a table a new generation after it may have changed. */
export function markTableChanged(table: SimpleTable): TableGenerationId {
  const generation = createTableGenerationId();
  generations.set(table, generation);
  return generation;
}

/** Restores the generation persisted with a cached table artifact. */
export function restoreTableGeneration(
  table: SimpleTable,
  generation: TableGenerationId,
): void {
  generations.set(table, generation);
}
