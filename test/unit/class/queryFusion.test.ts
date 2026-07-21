import { assert, assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";
import SDAError from "../../../src/class/SDAError.ts";
import { existsSync, mkdirSync } from "node:fs";

function spyOnQueries(simple: SimpleDB | SimpleTable): string[] {
  const queries: string[] = [];
  const original = simple.runQuery;
  simple.runQuery = (query, connection, returnData, options) => {
    queries.push(query);
    return original(query, connection, returnData, options);
  };
  return queries;
}

const data = [
  { name: "b", value: 2 },
  { name: "c", value: 3 },
  { name: "a", value: 1 },
];

Deno.test("should fuse consecutive builder methods into a single statement", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("fused");
  const queries = spyOnQueries(table);

  const result = await table
    .loadArray(data)
    .filter(`value > 1`)
    .addColumn("double", "number", `value * 2`)
    .selectColumns(["name", "double"])
    .getData();

  assertEquals(result, [
    { name: "b", double: 4 },
    { name: "c", double: 6 },
  ]);

  const createStatements = queries.filter((q) =>
    q.includes(`CREATE OR REPLACE TABLE "fused"`)
  );
  assertEquals(createStatements.length, 1);
  assert(createStatements[0].includes('WITH "s1" AS'));
  assert(createStatements[0].includes('"s3"'));

  await sdb.done();
});

Deno.test("should fuse REPLACE-style column updates into the chain", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("replaceFused");
  const queries = spyOnQueries(table);

  const result = await table
    .loadArray([{ name: "  Bob  " }, { name: "ALICE" }])
    .trim("name")
    .lower("name")
    .capitalize("name")
    .getData();

  assertEquals(result, [
    { name: "Bob" },
    { name: "Alice" },
  ]);

  const createStatements = queries.filter((q) =>
    q.includes(`CREATE OR REPLACE TABLE "replaceFused"`)
  );
  assertEquals(createStatements.length, 1);
  assert(createStatements[0].includes('WITH "s1" AS'));

  await sdb.done();
});

Deno.test("should produce the same results in statement style", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("statements");

  table.loadArray(data);
  table.filter(`value > 1`);
  table.addColumn("double", "number", `value * 2`);
  table.selectColumns(["name", "double"]);
  const result = await table.getData();

  assertEquals(result, [
    { name: "b", double: 4 },
    { name: "c", double: 6 },
  ]);

  await sdb.done();
});

Deno.test("should resolve mid-chain schemas for schema-dependent methods", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("midChainSchema");

  // convert() needs the schema of its input, which here is the output of
  // addColumn(), not the table itself.
  const result = await table
    .loadArray([{ value: 1 }])
    .addColumn("asString", "string", `'2,000'`)
    .convert({ asString: "number" })
    .getData();

  assertEquals(result, [{ value: 1, asString: 2000 }]);

  await sdb.done();
});

Deno.test("should not let cleanSQL cross fragment boundaries", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("fragments");

  // The filter uses JS syntax (&&), while the addColumn definition uses the
  // SQL concatenation operator (||), which must not be converted to OR.
  const result = await table
    .loadArray([{ a: "x", b: "y", n: 1 }])
    .filter(`n > 0 && n < 5`)
    .addColumn("c", "string", `a || b`)
    .getData();

  assertEquals(result, [{ a: "x", b: "y", n: 1, c: "xy" }]);

  await sdb.done();
});

Deno.test("should attribute a fused failure to the culprit method", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("attribution");

  const error = await assertRejects(() =>
    table
      .loadArray(data)
      .filter(`nonExistentColumn > 1`)
      .addColumn("double", "number", `value * 2`)
      .getData()
  );

  assert(error instanceof SDAError);
  assertEquals(error.method, "filter()");

  await sdb.done();
});

Deno.test("should throw at the observation point when convert() references a missing column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("convertValidation");

  table.loadArray(data);
  table.convert({ nonExistentColumn: "number" });

  const error = await assertRejects(() => table.getData());
  assert(
    error instanceof Error &&
      error.message.includes(
        "The column nonExistentColumn does not exist in the table.",
      ),
  );

  await sdb.done();
});

Deno.test("should execute queued methods with run()", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("run");

  await table
    .loadArray(data)
    .filter(`value > 1`)
    .run();

  assertEquals(table.pendingOps.length, 0);
  const nbRows = await table.getNbRows();
  assertEquals(nbRows, 2);

  await sdb.done();
});

Deno.test("should flush queued methods before an unconverted async method runs", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("ordering");

  // filter() is queued; sort() executes immediately, so the filter must run
  // first to preserve program order.
  table.loadArray(data);
  table.filter(`value > 1`);
  table.sort({ name: "desc" });
  const result = await table.getData();

  assertEquals(result, [
    { name: "c", value: 3 },
    { name: "b", value: 2 },
  ]);

  await sdb.done();
});

Deno.test("should flush a table's queued methods when another table observes", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("flushAllA");
  const tableB = sdb.newTable("flushAllB");

  tableA.loadArray(data);
  tableB.loadArray([{ key: 1 }]);

  // Observing B flushes A too, preserving program order across tables.
  await tableB.getData();
  assertEquals(tableA.pendingOps.length, 0);
  assertEquals(await sdb.hasTable("flushAllA"), true);

  await sdb.done();
});

Deno.test("should replay interleaved operations across tables in program order", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("orderA");
  const tableB = sdb.newTable("orderB");

  const queries: string[] = [];
  for (const simple of [sdb, tableA, tableB]) {
    const original = simple.runQuery;
    simple.runQuery = (query, connection, returnData, options) => {
      queries.push(query);
      return original(query, connection, returnData, options);
    };
  }

  tableA.loadArray(data);
  tableB.loadArray([{ n: 1 }]);
  tableA.filter(`value > 1`);
  tableB.addColumn("m", "number", `n * 10`);
  tableA.selectColumns("name");

  const resultA = await tableA.getData();
  const resultB = await tableB.getData();

  assertEquals(resultA, [{ name: "b" }, { name: "c" }]);
  assertEquals(resultB, [{ n: 1, m: 10 }]);

  // Table switches split fused segments so the statements execute in the
  // same database-wide order in which the methods were called.
  const creates = queries.filter((q) => q.includes("CREATE OR REPLACE TABLE"));
  const iFilter = creates.findIndex((q) =>
    q.includes(`"orderA"`) && q.includes("WHERE")
  );
  const iAddColumn = creates.findIndex((q) =>
    q.includes(`"orderB"`) && q.includes(`"m"`)
  );
  const iSelect = creates.findIndex((q) =>
    q.includes(`"orderA"`) && q.includes(`SELECT "name"`)
  );
  assert(iFilter !== -1 && iAddColumn !== -1 && iSelect !== -1);
  assert(iFilter < iAddColumn && iAddColumn < iSelect);

  await sdb.done();
});

Deno.test("should join with the other table's state at the join's position in program order", async () => {
  const sdb = new SimpleDB();
  const left = sdb.newTable("joinLeft");
  const right = sdb.newTable("joinRight");

  left.loadArray([
    { id: 1, city: "Montreal" },
    { id: 2, city: "Toronto" },
  ]);
  right.loadArray([
    { id: 1, pop: 100 },
    { id: 2, pop: 200 },
  ]);
  right.filter(`pop > 150`);
  const output = left.join(right, {
    type: "inner",
    outputTable: "joinOutput",
  });
  // Queued after the join: must NOT affect what the join sees.
  right.filter(`pop > 1000`);

  const result = await output.getData();
  assertEquals(result, [{ id: 2, city: "Toronto", pop: 200 }]);
  assertEquals(await right.getData(), []);

  await sdb.done();
});

Deno.test("should chain sync builders off a sync join", async () => {
  const sdb = new SimpleDB();
  const left = sdb.newTable("chainJoinLeft");
  const right = sdb.newTable("chainJoinRight");

  const result = await left
    .loadArray([
      { id: 1, city: "Montreal" },
      { id: 2, city: "Toronto" },
    ])
    .join(
      right.loadArray([
        { id: 1, pop: 100 },
        { id: 2, pop: 200 },
      ]),
      { outputTable: "chainJoinOutput" },
    )
    .filter(`pop > 150`)
    .selectColumns(["city", "pop"])
    .getData();

  assertEquals(result, [{ city: "Toronto", pop: 200 }]);

  await sdb.done();
});

Deno.test("should surface join validation errors at the observation point", async () => {
  const sdb = new SimpleDB();
  const left = sdb.newTable("joinErrLeft");
  const right = sdb.newTable("joinErrRight");

  left.loadArray([{ id: 1, name: "a" }]);
  right.loadArray([{ key: 1, value: 2 }]);
  left.join(right);

  const error = await assertRejects(() => left.getData());
  assert(error instanceof Error && error.message.includes("No common column"));

  await sdb.done();
});

Deno.test("should fuse row filters, string updates and sort into one statement", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("bigChain");
  const queries = spyOnQueries(table);

  const result = await table
    .loadArray([
      { name: " zebra ", value: 4 },
      { name: "apple", value: 1 },
      { name: "apple", value: 1 },
      { name: "banana", value: 2 },
      { name: "cherry", value: null },
    ])
    .removeDuplicates()
    .removeRows(`value > 3`)
    .trim("name")
    .replace("name", { e: "3" })
    .keepValues({ name: ["appl3", "banana", "ch3rry"] })
    .replaceNulls("value", 0)
    .concatenate(["name", "value"], "label", { separator: "-" })
    .sort({ name: "desc" })
    .getData();

  assertEquals(result, [
    { name: "ch3rry", value: 0, label: "ch3rry-0.0" },
    { name: "banana", value: 2, label: "banana-2.0" },
    { name: "appl3", value: 1, label: "appl3-1.0" },
  ]);

  const createStatements = queries.filter((q) =>
    q.includes(`CREATE OR REPLACE TABLE "bigChain"`)
  );
  assertEquals(createStatements.length, 1);
  assert(createStatements[0].includes("s8"));

  await sdb.done();
});

Deno.test("should fuse geospatial operations with regular ones, loading spatial once", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoFused");
  const queries = spyOnQueries(table);

  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const result = await table
    .centroid("centroid")
    .area("area", { unit: "km2", column: "geom" })
    .filter(`nameEnglish LIKE 'Q%'`)
    .selectColumns(["nameEnglish", "area"])
    .round("area")
    .getData();

  assertEquals(result, [{ nameEnglish: "Quebec", area: 1508203 }]);

  // One fused statement for the whole chain after the load.
  const createStatements = queries.filter((q) =>
    q.includes(`CREATE OR REPLACE TABLE "geoFused" AS WITH`)
  );
  assertEquals(createStatements.length, 1);
  assert(createStatements[0].includes("s5"));

  await sdb.done();
});

Deno.test("logSQL observes one fused statement without changing execution", async () => {
  const sdb = new SimpleDB({ logSQL: true });
  await sdb.start();
  const table = sdb.newTable("loggedFusion");
  const queries = spyOnQueries(table);

  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (message: string) => logs.push(message);
  let result;
  try {
    result = await table
      .loadArray(data)
      .filter(`value > 1`)
      .addColumn("double", "number", `value * 2`)
      .getData();
  } finally {
    console.log = originalLog;
  }

  assertEquals(result, [
    { name: "b", value: 2, double: 4 },
    { name: "c", value: 3, double: 6 },
  ]);

  const createStatements = queries.filter((q) =>
    q.includes(`CREATE OR REPLACE TABLE "loggedFusion"`)
  );
  assertEquals(createStatements.length, 1);
  assert(createStatements[0].includes('WITH "s1" AS'));
  assert(logs.includes(createStatements[0]));

  await sdb.done();
});

Deno.test("explainSQL logs a plan for a fused statement without changing its result", async () => {
  const sdb = new SimpleDB({ explainSQL: true });
  await sdb.start();
  const table = sdb.newTable("explainedFusion");
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (message: string) => logs.push(message);
  let result;
  try {
    result = await table
      .loadArray(data)
      .filter(`value > 1`)
      .selectColumns(["name", "value"])
      .getData();
  } finally {
    console.log = originalLog;
  }

  assertEquals(result, [
    { name: "b", value: 2 },
    { name: "c", value: 3 },
  ]);
  assert(
    logs.some((message) =>
      message.includes("EXPLAIN") && message.includes("explainedFusion")
    ),
  );

  await sdb.done();
});

Deno.test("explainSQL skips unsupported statements and never blocks valid SQL", async () => {
  const sdb = new SimpleDB({ explainSQL: true });
  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message: string) => warnings.push(message);
  try {
    // ATTACH and SET during setup are intentionally not explained.
    await sdb.start();
    assertEquals(warnings, []);

    // DuckDB executes CREATE TEMPORARY SECRET but does not support prefixing
    // it with EXPLAIN. The explanation warning must not block execution.
    await sdb.customQuery(
      `CREATE TEMPORARY SECRET issue86_secret (TYPE S3, KEY_ID 'x', SECRET 'y')`,
    );
  } finally {
    console.warn = originalWarn;
  }

  assertEquals(warnings.length, 1);
  assert(warnings[0].includes("executing it normally"));
  const secrets = await sdb.customQuery(
    `SELECT name FROM duckdb_secrets() WHERE name = 'issue86_secret'`,
    { returnData: true },
  );
  assertEquals(secrets, [{ name: "issue86_secret" }]);
  await sdb.done();
});

Deno.test("done() discards queued methods, cleans up, and rejects", async () => {
  const tempDir = "./test/output/pending_memory.tmp";
  const sdb = new SimpleDB({ tempDir });
  await sdb.start();
  mkdirSync(tempDir, { recursive: true });
  const table = sdb.newTable("neverExecuted");

  table.loadArray(data);
  table.filter(`value > 1`);

  await assertRejects(
    () => sdb.done(),
    Error,
    'The table "neverExecuted" has queued methods that were not executed: loadArray(), filter()',
  );
  assertEquals(table.pendingOps.length, 0);
  assertEquals(existsSync(tempDir), false);
  await assertRejects(() => sdb.connection.run("SELECT 1"));
});
