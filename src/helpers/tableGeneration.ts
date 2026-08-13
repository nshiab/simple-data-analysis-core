import crypto from "node:crypto";
import type SimpleTable from "../class/SimpleTable.ts";

const generations = new WeakMap<SimpleTable, string>();

/** Returns the current in-process generation identifier for a table. */
export function getTableGeneration(table: SimpleTable): string {
  let generation = generations.get(table);
  if (generation === undefined) {
    generation = crypto.randomUUID();
    generations.set(table, generation);
  }
  return generation;
}

/** Gives a table a new generation after it may have changed. */
export function markTableChanged(table: SimpleTable): string {
  const generation = crypto.randomUUID();
  generations.set(table, generation);
  return generation;
}

/** Restores the generation persisted with a cached table artifact. */
export function restoreTableGeneration(
  table: SimpleTable,
  generation: string,
): void {
  generations.set(table, generation);
}
