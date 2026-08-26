import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SDAError from "../../../src/class/SDAError.ts";
import { queueOp } from "../../../src/helpers/index.ts";
import { peekTableGeneration } from "../../../src/helpers/tableGeneration.ts";

Deno.test("queueOp drains builder operations queued by a barrier before later operations", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("remoteRows");
  let executed = false;

  queueOp(table, {
    kind: "asyncBarrier",
    method: "loadRemote()",
    parameters: { source: "test" },
    execute: async () => {
      await Promise.resolve();
      executed = true;
      table.loadArray([{ value: 1 }, { value: 2 }]);
    },
  });
  table.filter("value > 1");

  assertEquals(executed, false);
  assertEquals(await table.getData(), [{ value: 2 }]);
  assertEquals(executed, true);
  assertEquals(sdb.pendingCount, 0);
  await sdb.close();
});

Deno.test("an observer inside a queued barrier drains its earlier nested builders", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("observedInsideBarrier");
  let rowCountInside = 0;

  queueOp(table, {
    kind: "asyncBarrier",
    method: "loadAndObserve()",
    parameters: {},
    execute: async () => {
      table.loadArray([{ value: 1 }, { value: 2 }]);
      rowCountInside = await table.getRowCount();
      table.addColumn("doubled", "number", "value * 2");
    },
  });
  table.filter("doubled > 2");

  assertEquals(await table.getData(), [{ value: 2, doubled: 4 }]);
  assertEquals(rowCountInside, 2);
  await sdb.close();
});

Deno.test("concurrent observers inside a queued barrier share one nested drain", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("concurrentInsideBarrier");
  let observations: [number, string[]] | undefined;

  queueOp(table, {
    kind: "asyncBarrier",
    method: "loadAndObserveConcurrently()",
    parameters: {},
    execute: async () => {
      table.loadArray([{ value: 1 }, { value: 2 }]);
      await Promise.all([table.run(), table.run()]);
      observations = [await table.getRowCount(), await table.getColumns()];
    },
  });

  await table.run();
  assertEquals(observations, [2, ["value"]]);
  await sdb.close();
});

Deno.test("operations queued concurrently outside a barrier stay in the top-level queue", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

  queueOp(first, {
    kind: "asyncBarrier",
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
  assertEquals(calls, ["nested", "later"]);
  assertEquals(second.pendingOps.map((op) => op.method), ["updateWithJS()"]);
  await second.getData();
  assertEquals(calls, ["nested", "later", "external"]);
  await sdb.close();
});

Deno.test("nested operations retain table-generation tracking", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const control = sdb.newTable("generationControl");
  const data = sdb.newTable("generationData");
  data.loadArray([{ value: 1 }, { value: 2 }]);
  await data.run();
  const generationBefore = peekTableGeneration(data);

  queueOp(control, {
    kind: "asyncBarrier",
    method: "nestedGenerationChange()",
    parameters: {},
    execute: async () => {
      await Promise.resolve();
      data.filter("value > 1");
    },
  });

  assertEquals(peekTableGeneration(data), generationBefore);
  await control.run();
  assertNotEquals(peekTableGeneration(data), generationBefore);
  assertEquals(await data.getData(), [{ value: 2 }]);
  await sdb.close();
});

Deno.test("a nested failure keeps another table's nested work queued", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const failing = sdb.newTable("nestedFailure");
  const unaffected = sdb.newTable("nestedUnaffected");
  failing.loadArray([{ value: 1 }]);
  unaffected.loadArray([{ value: 1 }, { value: 2 }]);
  await sdb.run();

  queueOp(failing, {
    kind: "asyncBarrier",
    method: "nestedFailureExtension()",
    parameters: {},
    execute: async () => {
      failing.filter("missing > 0");
      unaffected.filter("value > 1");
      await failing.run();
    },
  });

  const error = await assertRejects(() => failing.run());
  assertEquals(error instanceof SDAError, true);
  assertEquals((error as SDAError).method, "filter()");
  assertEquals(unaffected.pendingOps.map((op) => op.method), ["filter()"]);
  assertEquals(await unaffected.getData(), [{ value: 2 }]);
  await sdb.close();
});

Deno.test("a queued output-table barrier reads its source at its call position", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const source = sdb.newTable("extensionSource");
  source.loadArray([{ value: 1 }, { value: 2 }]);
  const output = sdb.newTable("extensionOutput");

  queueOp(output, {
    kind: "asyncBarrier",
    method: "copyRemote()",
    parameters: { outputTable: output.name },
    execute: async () => {
      output.loadArray(await source.getData());
    },
  });
  output.filter("value > 1");
  source.filter("value > 100");

  assertEquals(await output.getData(), [{ value: 2 }]);
  assertEquals(await source.getData(), []);
  await sdb.close();
});
