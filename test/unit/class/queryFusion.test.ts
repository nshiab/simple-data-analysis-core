import { assert, assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";
import SDAError from "../../../src/class/SDAError.ts";

function spyOnQueries(simple: SimpleDB | SimpleTable): string[] {
  const queries: string[] = [];
  const original = simple.runQuery;
  simple.runQuery = (query, connection, returnDataFromQuery, options) => {
    queries.push(query);
    return original(query, connection, returnDataFromQuery, options);
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
  assert(createStatements[0].includes("WITH s1 AS"));
  assert(createStatements[0].includes("s3"));

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
  assert(createStatements[0].includes("WITH s1 AS"));

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
  await table.sort({ name: "desc" });
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

Deno.test("should execute step by step with debug: true", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("debugMode");
  table.debug = true;
  const queries = spyOnQueries(table);

  // Silence the debug logging for the test output.
  const originalLog = console.log;
  console.log = () => {};
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
    q.includes(`CREATE OR REPLACE TABLE "debugMode"`)
  );
  assertEquals(createStatements.length, 2);
  assert(createStatements.every((q) => !q.includes("WITH s1 AS")));

  await sdb.done();
});

Deno.test("should warn on done() when queued methods were never executed", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("neverExecuted");

  table.loadArray(data);
  table.filter(`value > 1`);

  const warnings: string[] = [];
  const originalWarn = console.warn;
  console.warn = (message: string) => {
    warnings.push(message);
  };
  try {
    await sdb.done();
  } finally {
    console.warn = originalWarn;
  }

  assertEquals(warnings.length, 1);
  assert(warnings[0].includes(`"neverExecuted"`));
  assert(warnings[0].includes("loadArray()"));
  assert(warnings[0].includes("filter()"));
  assertEquals(table.pendingOps.length, 0);
});
