import { AsyncLocalStorage } from "node:async_hooks";
import type SimpleDB from "../class/SimpleDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { PendingOp } from "./pendingOps.ts";

export type PendingEntry = {
  table: SimpleTable;
  op: PendingOp;
};

export type AsyncOperationFrame = {
  sdb: SimpleDB;
  entries: PendingEntry[];
  drainPromise: Promise<void> | null;
  open: boolean;
};

const operationContext = new AsyncLocalStorage<AsyncOperationFrame[]>();
const drainContext = new AsyncLocalStorage<Set<AsyncOperationFrame>>();

export function getAsyncOperationFrame(
  sdb: SimpleDB,
): AsyncOperationFrame | undefined {
  return operationContext.getStore()?.findLast((frame) =>
    frame.sdb === sdb && frame.open
  );
}

export function captureAsyncOperation(
  sdb: SimpleDB,
  entry: PendingEntry,
): boolean {
  const frame = getAsyncOperationFrame(sdb);
  if (frame === undefined) {
    return false;
  }
  frame.entries.push(entry);
  return true;
}

export async function runWithAsyncOperationFrame<T>(
  sdb: SimpleDB,
  fn: (frame: AsyncOperationFrame) => Promise<T>,
): Promise<T> {
  const frame: AsyncOperationFrame = {
    sdb,
    entries: [],
    drainPromise: null,
    open: true,
  };
  const frames = [...(operationContext.getStore() ?? []), frame];
  try {
    return await operationContext.run(frames, () => fn(frame));
  } finally {
    frame.open = false;
    frame.entries.length = 0;
  }
}

export function isDrainingAsyncOperationFrame(
  frame: AsyncOperationFrame,
): boolean {
  return drainContext.getStore()?.has(frame) ?? false;
}

export function runWhileDrainingAsyncOperationFrame<T>(
  frame: AsyncOperationFrame,
  fn: () => Promise<T>,
): Promise<T> {
  const draining = new Set(drainContext.getStore());
  draining.add(frame);
  return drainContext.run(draining, fn);
}
