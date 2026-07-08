import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

// Regression tests for the bugs found reviewing the sync-builder/query-fusion
// work: concurrency, cross-table error isolation, removed-table re-queuing,
// duplicate-column errors, type-preserving replaceNulls, updateWithJS
// immediacy, self-referencing fused SQL, and flush-time validation.

Deno.test("concurrent observers each see fully flushed state", async () => {
  const sdb = new SimpleDB();
  const a = sdb.newTable("concA");
  const b = sdb.newTable("concB");

  a.loadArray([{ v: 10 }, { v: 20 }]).filter("v > 15");
  b.loadArray([{ w: 1 }, { w: 2 }]).filter("w > 1");

  // Awaiting both at once: the second observer must wait for the first
  // observer's flush instead of querying mid-flush.
  const [ra, rb] = await Promise.all([a.getData(), b.getData()]);

  assertEquals(ra, [{ v: 20 }]);
  assertEquals(rb, [{ w: 2 }]);

  await sdb.done();
});

Deno.test("a caught flush error keeps other tables' queued work", async () => {
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
  assertEquals(rb, [{ y: 10 }]);

  await sdb.done();
});

Deno.test("re-queuing on a removed table re-registers it for the flush", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("gone");

  t.loadArray([{ a: 1 }]);
  await t.getData();
  await t.removeTable();

  // Loading again recreates the table, like v1's immediate execution did.
  t.loadArray([{ a: 2 }]);
  const r = await t.getData();
  assertEquals(r, [{ a: 2 }]);

  await sdb.done();
});

Deno.test("cloneColumn throws when the target column already exists", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("dup");

  t.loadArray([{ a: 1, b: 2 }]).cloneColumn("a", "b");

  await assertRejects(
    () => t.getData(),
    Error,
    'the column "b" already exists',
  );

  await sdb.done();
});

Deno.test("addColumn throws when the target column already exists", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("dupAdd");

  t.loadArray([{ a: 1, b: 2 }]).addColumn("b", "integer", "a * 2");

  await assertRejects(
    () => t.getData(),
    Error,
    'the column "b" already exists',
  );

  await sdb.done();
});

Deno.test("replaceNulls fills a numeric constant into string and number columns", async () => {
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
  assertEquals(r, [
    { name: "x", n: 5 },
    { name: "0", n: 0 },
  ]);

  await sdb.done();
});

Deno.test("updateWithJS applies the update before resolving", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("ujs");

  t.loadArray([{ v: 1 }, { v: 2 }]);
  await t.updateWithJS((rows) =>
    rows.map((r) => ({ v: (r.v as number) * 10 }))
  );

  // updateWithJS is async-immediate: nothing must be left queued when it
  // resolves, regardless of the (non-batched) path taken.
  assertEquals(t.pendingOps.length, 0);

  const r = await t.getData();
  assertEquals(r, [{ v: 10 }, { v: 20 }]);

  await sdb.done();
});

Deno.test("a fused filter with a subquery on its own table matches stepwise execution", async () => {
  const sdb = new SimpleDB();
  const t = sdb.newTable("selfref");

  t.loadArray([{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }]);
  t.filter("x > 2");
  // The subquery names the table itself, so it must read the previous step's
  // output (rows 3-5, average 4), not the pre-chain table (average 3).
  t.filter(`x > (SELECT AVG(x) FROM "selfref")`);

  const r = await t.getData();
  assertEquals(r, [{ x: 5 }]);

  await sdb.done();
});

Deno.test("debug mode and fused mode agree on a self-referencing chain", async () => {
  const rows = [{ x: 1 }, { x: 2 }, { x: 3 }, { x: 4 }, { x: 5 }];

  const fusedDB = new SimpleDB();
  const fused = fusedDB.newTable("f");
  fused.loadArray(rows).filter("x > 2").filter(
    `x > (SELECT AVG(x) FROM "f")`,
  );
  const fusedResult = await fused.getData();

  const debugDB = new SimpleDB({ debug: true });
  const stepwise = debugDB.newTable("f");
  stepwise.loadArray(rows).filter("x > 2").filter(
    `x > (SELECT AVG(x) FROM "f")`,
  );
  const stepwiseResult = await stepwise.getData();

  assertEquals(fusedResult, stepwiseResult);

  await fusedDB.done();
  await debugDB.done();
});

Deno.test("a flush-time validation error still applies the steps before it", async () => {
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
  assertEquals(r, [{ v: 2 }, { v: 3 }]);

  await sdb.done();
});

Deno.test("interleaved per-table chains still fuse within each table", async () => {
  const sdb = new SimpleDB();
  const a = sdb.newTable("fuseA");
  const b = sdb.newTable("fuseB");
  const queries: string[] = [];
  for (const simple of [a, b]) {
    const original = simple.runQuery;
    simple.runQuery = (query, connection, returnDataFromQuery, options) => {
      queries.push(query);
      return original(query, connection, returnDataFromQuery, options);
    };
  }

  a.loadArray([{ v: 1 }, { v: 2 }, { v: 3 }]);
  b.loadArray([{ w: 1 }, { w: 2 }, { w: 3 }]);
  // Interleaved, but each operation reads only its own table, so each
  // table's two operations still fuse into one statement.
  a.filter("v > 1");
  b.filter("w > 1");
  a.selectColumns("v");
  b.selectColumns("w");

  assertEquals(await a.getData(), [{ v: 2 }, { v: 3 }]);
  assertEquals(await b.getData(), [{ w: 2 }, { w: 3 }]);

  const fusedA = queries.filter((q) =>
    q.includes(`CREATE OR REPLACE TABLE "fuseA"`) && q.includes("WITH s1 AS")
  );
  assertEquals(fusedA.length, 1);

  await sdb.done();
});
