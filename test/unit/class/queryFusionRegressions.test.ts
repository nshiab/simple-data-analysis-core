import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

// Regression tests for the bugs found reviewing the sync-builder/query-fusion
// work: concurrency, cross-table error isolation, removed-table re-queuing,
// duplicate-column errors, type-preserving replaceNulls, queued updateWithJS,
// self-referencing fused SQL, and flush-time validation.

test("concurrent observers each see fully flushed state", async () => {
  const sdb = new SimpleDB();
  const a = sdb.newTable("concA");
  const b = sdb.newTable("concB");

  a.loadArray([{ v: 10 }, { v: 20 }]).filter("v > 15");
  b.loadArray([{ w: 1 }, { w: 2 }]).filter("w > 1");

  // Awaiting both at once: the second observer must wait for the first
  // observer's flush instead of querying mid-flush.
  const [ra, rb] = await Promise.all([a.getData(), b.getData()]);

  expect(ra).toStrictEqual([{ v: 20 }]);
  expect(rb).toStrictEqual([{ w: 2 }]);

  await sdb.close();
});

test("a caught flush error keeps other tables' queued work", async () => {
  const sdb = new SimpleDB();
  const a = sdb.newTable("errA");
  const b = sdb.newTable("errB");

  a.loadArray([{ x: 1 }]);
  await a.getData();

  b.loadArray([{ y: 1 }, { y: 10 }]);
  a.filter("nonexistent > 1");
  b.filter("y > 5");

  // a's filter references a missing column and fails when observed.
  await assertRejects(() => a.getData());

  // b's independent filter was queued successfully and must still apply.
  const rb = await b.getData();
  expect(rb).toStrictEqual([{ y: 10 }]);

  await sdb.close();
});

test("the first failing operation in database-wide order stops the flush", async () => {
  const sdb = new SimpleDB();
  const a = sdb.newTable("orderedErrorA");
  const b = sdb.newTable("orderedErrorB");

  a.loadArray([{ x: 1 }, { x: 2 }]);
  b.loadArray([{ y: 1 }]);
  await sdb.run();

  a.filter("x > 1");
  b.filter("missing_b > 0");
  a.convert({ missing_a: "integer" });

  await assertRejects(() => a.getData(), Error, "missing_b");
  await assertRejects(() => a.getData(), Error, "missing_a");
  expect(await a.getData()).toStrictEqual([{ x: 2 }]);

  await sdb.close();
});

test("re-queuing on a removed table re-registers it for the flush", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("gone");

  t.loadArray([{ a: 1 }]);
  await t.getData();
  await t.removeTable();

  // Loading again recreates the table, like v1's immediate execution did.
  t.loadArray([{ a: 2 }]);
  const r = await t.getData();
  expect(r).toStrictEqual([{ a: 2 }]);

  await sdb.close();
});

test("cloneColumn throws when the target column already exists", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("dup");

  t.loadArray([{ a: 1, b: 2 }]).cloneColumn("a", "b");

  await assertRejects(() => t.getData(), Error, 'the column "b" already exists');

  await sdb.close();
});

test("addColumn throws when the target column already exists", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("dupAdd");

  t.loadArray([{ a: 1, b: 2 }]).addColumn("b", "integer", "a * 2");

  await assertRejects(() => t.getData(), Error, 'the column "b" already exists');

  await sdb.close();
});

test("replaceNulls fills a numeric constant into string and number columns", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("mixedNulls");

  t.loadArray([
    { name: "x", n: 5 },
    { name: null, n: null },
  ]);
  t.replaceNulls("all", 0);

  const r = await t.getData();
  // The value is cast to each column's type, like v1's per-column UPDATE:
  // '0' into the string column, 0 into the numeric column.
  expect(r).toStrictEqual([
    { name: "x", n: 5 },
    { name: "0", n: 0 },
  ]);

  await sdb.close();
});

test("updateWithJS queues its modifier until an observation point", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("ujs");

  t.loadArray([{ v: 1 }, { v: 2 }]);
  let calls = 0;
  const returned = t
    .updateWithJS((rows) => {
      calls++;
      return rows.map((r) => ({ v: (r.v as number) * 10 }));
    })
    .filter("v > 10");

  expect(returned).toStrictEqual(t);
  expect(calls).toStrictEqual(0);
  expect(t.pendingOps.map((op) => op.method)).toStrictEqual([
    "loadArray()",
    "updateWithJS()",
    "filter()",
  ]);

  const r = await t.getData();
  expect(calls).toStrictEqual(1);
  expect(t.pendingOps.length).toStrictEqual(0);
  expect(r).toStrictEqual([{ v: 20 }]);

  await sdb.close();
});

test("a fused filter with a subquery on its own table matches stepwise execution", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("selfref");

  t.loadArray([{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }]);
  t.filter("x > 2");
  // The subquery names the table itself, so it must read the previous step's
  // output (rows 3-5, average 4), not the pre-chain table (average 3).
  t.filter(`x > (SELECT AVG(x) FROM "selfref")`);

  const r = await t.getData();
  expect(r).toStrictEqual([{ x: 5 }]);

  await sdb.close();
});

test("self-referencing chains agree when SQL logging is enabled", async () => {
  const rows = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }];

  const fusedDB = new SimpleDB();
  const fused = fusedDB.newTable("f");
  fused.loadArray(rows).filter("x > 2").filter(`x > (SELECT AVG(x) FROM "f")`);
  const fusedResult = await fused.getData();

  const loggedDB = new SimpleDB({ logSQL: true });
  const logged = loggedDB.newTable("f");
  logged.loadArray(rows).filter("x > 2").filter(`x > (SELECT AVG(x) FROM "f")`);
  const originalLog = console.log;
  console.log = () => {};
  let loggedResult;
  try {
    loggedResult = await logged.getData();
  } finally {
    console.log = originalLog;
  }

  expect(fusedResult).toStrictEqual(loggedResult);

  await fusedDB.close();
  await loggedDB.close();
});

test("raw SQL strings are preserved when queued", async () => {
  const sdb = new SimpleDB();
  const marker = "__sda_captured_input_relation__";
  const table = sdb.newTable("rawSqlCapture");

  table.loadArray([{ value: marker }, { value: "other" }]);
  table.filter(`value = '${marker}'`);

  expect(await table.getData()).toStrictEqual([{ value: marker }]);
  await sdb.close();
});

test("a flush-time validation error still applies the steps before it", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("prefix");

  t.loadArray([{ v: 1 }, { v: 2 }, { v: 3 }]);
  await t.getData();

  t.filter("v > 1");
  // convert() validates its columns at flush time and throws on a missing
  // one, but the filter queued before it must already have executed.
  t.convert({ missing: "integer" });

  await assertRejects(() => t.getData());

  const r = await t.getData();
  expect(r).toStrictEqual([{ v: 2 }, { v: 3 }]);

  await sdb.close();
});

test("interleaved table operations execute as contiguous segments", async () => {
  const sdb = new SimpleDB();
  const a = sdb.newTable("fuseA");
  const b = sdb.newTable("fuseB");
  const queries: string[] = [];
  for (const simple of [a, b]) {
    const original = simple.runQuery;
    simple.runQuery = (query, connection, returnData, options) => {
      queries.push(query);
      return original(query, connection, returnData, options);
    };
  }

  a.loadArray([{ v: 1 }, { v: 2 }, { v: 3 }]);
  b.loadArray([{ w: 1 }, { w: 2 }, { w: 3 }]);
  // Switching tables closes the active segment so global execution and
  // failure order remain identical to the order in which methods were called.
  a.filter("v > 1");
  b.filter("w > 1");
  a.selectColumns("v");
  b.selectColumns("w");

  expect(await a.getData()).toStrictEqual([{ v: 2 }, { v: 3 }]);
  expect(await b.getData()).toStrictEqual([{ w: 2 }, { w: 3 }]);

  const statementsForA = queries.filter((q) => q.includes(`CREATE OR REPLACE TABLE "fuseA"`));
  expect(statementsForA.length).toStrictEqual(2);
  expect(statementsForA.every((query) => !query.includes("WITH"))).toStrictEqual(true);

  await sdb.close();
});

test("clone() fuses with a subsequent op on the clone into one statement", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("cloneFuseSrc");
  table.loadArray([{ v: 1 }, { v: 2 }, { v: 3 }]);

  const clone = table.clone("cloneFuseDst");
  const queries: string[] = [];
  const original = clone.runQuery;
  clone.runQuery = (query, connection, returnData, options) => {
    queries.push(query);
    return original(query, connection, returnData, options);
  };
  clone.filter("v > 1");

  expect(await clone.getData()).toStrictEqual([{ v: 2 }, { v: 3 }]);

  const fused = queries.filter(
    (q) => q.includes(`CREATE OR REPLACE TABLE "cloneFuseDst"`) && q.includes('WITH "s1" AS'),
  );
  expect(fused.length).toStrictEqual(1);

  await sdb.close();
});

test("clone() reads simpleTable's state at its call position, not later mutations", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("clonePosition");
  table.loadArray([{ v: 1 }, { v: 2 }, { v: 3 }]);
  table.filter("v > 1");

  const clone = table.clone();
  // Queued after clone(): the clone must not see this later mutation.
  table.addColumn("doubled", "integer", "v * 2");

  expect(await clone.getData()).toStrictEqual([{ v: 2 }, { v: 3 }]);
  expect(await table.getData()).toStrictEqual([
    { v: 2, doubled: 4 },
    { v: 3, doubled: 6 },
  ]);

  await sdb.close();
});

test("selectRows() with outputTable fuses with a subsequent op into one statement", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectRowsFuseSrc");
  table.loadArray([{ v: 1 }, { v: 2 }, { v: 3 }]);

  const out = table.selectRows(2, { outputTable: "selectRowsFuseDst" });
  const queries: string[] = [];
  const original = out.runQuery;
  out.runQuery = (query, connection, returnData, options) => {
    queries.push(query);
    return original(query, connection, returnData, options);
  };
  out.filter("v > 1");

  expect(await out.getData()).toStrictEqual([{ v: 2 }]);

  const fused = queries.filter(
    (q) => q.includes(`CREATE OR REPLACE TABLE "selectRowsFuseDst"`) && q.includes('WITH "s1" AS'),
  );
  expect(fused.length).toStrictEqual(1);

  await sdb.close();
});

test("selectRows() with outputTable reads simpleTable's state at its call position", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectRowsPosition");
  table.loadArray([{ v: 1 }, { v: 2 }, { v: 3 }]);
  table.filter("v > 1");

  const out = table.selectRows(10, { outputTable: true });
  // Queued after selectRows(): the output table must not see this later
  // mutation.
  table.addColumn("doubled", "integer", "v * 2");

  expect(await out.getData()).toStrictEqual([{ v: 2 }, { v: 3 }]);
  expect(await table.getData()).toStrictEqual([
    { v: 2, doubled: 4 },
    { v: 3, doubled: 6 },
  ]);

  await sdb.close();
});

test("escaped quoted self-references read the preceding chain result", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable('quote"name');
    await table.loadArray([{ x: 1 }, { x: 2 }, { x: 3 }]).run();
    expect(
      await table.filter("x > 1").filter('x > (SELECT min(x) FROM "quote""name")').getData(),
    ).toStrictEqual([{ x: 3 }]);
  } finally {
    await sdb.close();
  }
});
