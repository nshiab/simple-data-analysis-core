import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SDAError from "../../../src/class/SDAError.ts";
import { queueAsyncBarrier } from "../../../src/helpers/index.ts";
import { peekTableGeneration } from "../../../src/helpers/tableGeneration.ts";

test("queueAsyncBarrier drains nested builders before later operations", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("remoteRows");
  let executed = false;

  queueAsyncBarrier(table, {
    method: "loadRemote()",
    parameters: { source: "test" },
    execute: async () => {
      await Promise.resolve();
      executed = true;
      table.loadArray([{ value: 1 }, { value: 2 }]);
    },
  });
  table.filter("value > 1");

  expect(executed).toStrictEqual(false);
  expect(await table.getData()).toStrictEqual([{ value: 2 }]);
  expect(executed).toStrictEqual(true);
  expect(sdb.pendingCount).toStrictEqual(0);
  await sdb.close();
});

test("an observer inside a queued barrier drains its earlier nested builders", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("observedInsideBarrier");
  let rowCountInside = 0;

  queueAsyncBarrier(table, {
    method: "loadAndObserve()",
    parameters: {},
    execute: async () => {
      table.loadArray([{ value: 1 }, { value: 2 }]);
      rowCountInside = await table.getRowCount();
      table.addColumn("doubled", "number", "value * 2");
    },
  });
  table.filter("doubled > 2");

  expect(await table.getData()).toStrictEqual([{ value: 2, doubled: 4 }]);
  expect(rowCountInside).toStrictEqual(2);
  await sdb.close();
});

test("concurrent observers inside a queued barrier share one nested drain", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("concurrentInsideBarrier");
  let observations: [number, string[]] | undefined;

  queueAsyncBarrier(table, {
    method: "loadAndObserveConcurrently()",
    parameters: {},
    execute: async () => {
      table.loadArray([{ value: 1 }, { value: 2 }]);
      await Promise.all([table.run(), table.run()]);
      observations = [await table.getRowCount(), await table.getColumns()];
    },
  });

  await table.run();
  expect(observations).toStrictEqual([2, ["value"]]);
  await sdb.close();
});

test("operations queued concurrently outside a barrier stay in the top-level queue", async () => {
  const sdb = new SimpleDB();
  const first = sdb.newTable("scopedFirst");
  const second = sdb.newTable("scopedSecond");
  first.loadArray([{ value: 1 }]);
  second.loadArray([{ value: 2 }]);
  await sdb.run();

  let signalStarted: () => void = () => {};
  const started = new Promise<void>((resolve) => {
    signalStarted = resolve;
  });
  let releaseBarrier: () => void = () => {};
  const release = new Promise<void>((resolve) => {
    releaseBarrier = resolve;
  });
  const calls: string[] = [];

  queueAsyncBarrier(first, {
    method: "delayedExtension()",
    parameters: {},
    execute: async () => {
      signalStarted();
      await release;
      first.updateWithJS((rows) => {
        calls.push("nested");
        return rows;
      });
    },
  });
  first.updateWithJS((rows) => {
    calls.push("later");
    return rows;
  });

  const firstObservation = first.getData();
  await started;
  second.updateWithJS((rows) => {
    calls.push("external");
    return rows;
  });
  releaseBarrier();

  await firstObservation;
  expect(calls).toStrictEqual(["nested", "later"]);
  expect(second.pendingOps.map((op) => op.method)).toStrictEqual(["updateWithJS()"]);
  await second.getData();
  expect(calls).toStrictEqual(["nested", "later", "external"]);
  await sdb.close();
});

test("nested operations retain table-generation tracking", async () => {
  const sdb = new SimpleDB();
  const control = sdb.newTable("generationControl");
  const data = sdb.newTable("generationData");
  data.loadArray([{ value: 1 }, { value: 2 }]);
  await data.run();
  const generationBefore = peekTableGeneration(data);

  queueAsyncBarrier(control, {
    method: "nestedGenerationChange()",
    parameters: {},
    execute: async () => {
      await Promise.resolve();
      data.filter("value > 1");
    },
  });

  expect(peekTableGeneration(data)).toStrictEqual(generationBefore);
  await control.run();
  expect(peekTableGeneration(data)).not.toStrictEqual(generationBefore);
  expect(await data.getData()).toStrictEqual([{ value: 2 }]);
  await sdb.close();
});

test("a nested failure keeps another table's nested work queued", async () => {
  const sdb = new SimpleDB();
  const failing = sdb.newTable("nestedFailure");
  const unaffected = sdb.newTable("nestedUnaffected");
  failing.loadArray([{ value: 1 }]);
  unaffected.loadArray([{ value: 1 }, { value: 2 }]);
  await sdb.run();

  queueAsyncBarrier(failing, {
    method: "nestedFailureExtension()",
    parameters: {},
    execute: async () => {
      failing.filter("missing > 0");
      unaffected.filter("value > 1");
      await failing.run();
    },
  });

  const error = await assertRejects(() => failing.run());
  expect(error instanceof SDAError).toStrictEqual(true);
  expect((error as SDAError).method).toStrictEqual("filter()");
  expect(unaffected.pendingOps.map((op) => op.method)).toStrictEqual(["filter()"]);
  expect(await unaffected.getData()).toStrictEqual([{ value: 2 }]);
  await sdb.close();
});

test("a queued output-table barrier reads its source at its call position", async () => {
  const sdb = new SimpleDB();
  const source = sdb.newTable("extensionSource");
  source.loadArray([{ value: 1 }, { value: 2 }]);
  const output = sdb.newTable("extensionOutput");

  queueAsyncBarrier(output, {
    method: "copyRemote()",
    parameters: { outputTable: output.name },
    execute: async () => {
      output.loadArray(await source.getData());
    },
  });
  output.filter("value > 1");
  source.filter("value > 100");

  expect(await output.getData()).toStrictEqual([{ value: 2 }]);
  expect(await source.getData()).toStrictEqual([]);
  await sdb.close();
});

test("a rejected async barrier discards nested builders not yet drained", async () => {
  const sdb = new SimpleDB();
  const barrierTable = sdb.newTable("rejectedBarrier");
  const nestedTable = sdb.newTable("discardedNestedWork");
  barrierTable.loadArray([{ value: 1 }]);
  nestedTable.loadArray([{ value: 1 }, { value: 2 }]);
  await sdb.run();

  queueAsyncBarrier(barrierTable, {
    method: "rejectBeforeDrain()",
    parameters: {},
    execute: async () => {
      await Promise.resolve();
      nestedTable.filter("value > 1");
      throw new Error("Barrier failed");
    },
  });

  await assertRejects(() => barrierTable.run(), Error, "Barrier failed");
  expect(nestedTable.pendingOps).toStrictEqual([]);
  expect(sdb.pendingCount).toStrictEqual(0);
  expect(await nestedTable.getData()).toStrictEqual([{ value: 1 }, { value: 2 }]);
  await sdb.close();
});

test("a rejected async barrier does not roll back nested builders already drained", async () => {
  const sdb = new SimpleDB();
  const barrierTable = sdb.newTable("rejectedAfterDrain");
  const nestedTable = sdb.newTable("appliedNestedWork");
  barrierTable.loadArray([{ value: 1 }]);
  nestedTable.loadArray([{ value: 1 }, { value: 2 }]);
  await sdb.run();

  queueAsyncBarrier(barrierTable, {
    method: "rejectAfterDrain()",
    parameters: {},
    execute: async () => {
      nestedTable.filter("value > 1");
      await nestedTable.run();
      throw new Error("Barrier failed after drain");
    },
  });

  await assertRejects(() => barrierTable.run(), Error, "Barrier failed after drain");
  expect(await nestedTable.getData()).toStrictEqual([{ value: 2 }]);
  await sdb.close();
});
