import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("addSummaryRows() adds a sum row for all numeric columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("sales");

  table.loadArray([
    { region: "North", sales: 10, expenses: 4, note: "first" },
    { region: "South", sales: 20, expenses: 6, note: "second" },
  ]);
  table.addSummaryRows("all", "region", "sum");

  assertEquals(await table.getData(), [
    { region: "North", sales: 10, expenses: 4, note: "first" },
    { region: "South", sales: 20, expenses: 6, note: "second" },
    { region: "sum", sales: 30, expenses: 10, note: null },
  ]);

  await sdb.close();
});

Deno.test("addSummaryRows() accepts mixed summary strings and objects", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("selectedSales");

  table.loadArray([
    { region: "North", sales: 10, expenses: 4 },
    { region: "South", sales: 20, expenses: 6 },
  ]);
  table.addSummaryRows(["sales"], "region", [
    "sum",
    { summary: "mean", label: "Average" },
  ]);

  assertEquals(await table.getData(), [
    { region: "North", sales: 10, expenses: 4 },
    { region: "South", sales: 20, expenses: 6 },
    { region: "sum", sales: 30, expenses: null },
    { region: "Average", sales: 15, expenses: null },
  ]);

  await sdb.close();
});

Deno.test("addSummaryRows() adds every supported column summary when summaries are omitted", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("allSummaries");

  table.loadArray([
    { statistic: "a", value: 1 },
    { statistic: "b", value: 2 },
    { statistic: "c", value: null },
  ]);
  table.addSummaryRows("value", "statistic");

  const data = await table.getData();
  assertEquals(data.slice(3).map((row) => row.statistic), [
    "countUnique",
    "countNull",
    "min",
    "max",
    "mean",
    "median",
    "sum",
    "skew",
    "stdDev",
    "var",
  ]);
  assertEquals(data.find((row) => row.statistic === "countNull")?.value, 1);

  await sdb.close();
});

Deno.test("addSummaryRows() computes every row from the original input", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("originalInput");

  table.loadArray([
    { statistic: "a", value: 10 },
    { statistic: "b", value: 20 },
  ]);
  table.addSummaryRows("value", "statistic", ["sum", "mean"]);

  const data = await table.getData();
  assertEquals(data.slice(2), [
    { statistic: "sum", value: 30 },
    { statistic: "mean", value: 15 },
  ]);

  await sdb.close();
});

Deno.test("addSummaryRows() binds custom labels", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", logSQL: true });
  const table = sdb.newTable("boundLabels");

  const logs: unknown[][] = [];
  let data: { [key: string]: unknown }[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args);
  try {
    table.loadArray([{ statistic: "a", value: 2 }]);
    await table.run();
    table.addSummaryRows("all", "statistic", {
      summary: "sum",
      label: "Owner's total",
    });
    await table.run();
    data = await table.getData();
  } finally {
    console.log = originalLog;
  }

  assertEquals(data.at(-1), {
    statistic: "Owner's total",
    value: 2,
  });
  assertEquals(
    logs.some(([message]) =>
      typeof message === "string" &&
      message.includes("CAST(? AS VARCHAR)")
    ),
    true,
  );
  assertEquals(logs.some(([message]) => message === "Bound values:"), true);

  await sdb.close();
});

Deno.test("addSummaryRows() composes with preceding queued methods", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("filteredSummary");

  table
    .loadArray([
      { statistic: "a", value: 1 },
      { statistic: "b", value: 2 },
      { statistic: "c", value: 3 },
    ])
    .filter("value >= 2")
    .addSummaryRows("all", "statistic", "sum");

  assertEquals(await table.getData(), [
    { statistic: "b", value: 2 },
    { statistic: "c", value: 3 },
    { statistic: "sum", value: 5 },
  ]);

  await sdb.close();
});

Deno.test("addSummaryRows() rejects empty column and summary arrays", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("emptyOptions");

  assertThrows(
    () => table.addSummaryRows([], "statistic", "sum"),
    Error,
    'addSummaryRows() requires at least one column or "all".',
  );
  assertThrows(
    () => table.addSummaryRows("all", "statistic", []),
    Error,
    "addSummaryRows() summaries cannot be an empty array. Omit summaries to add every supported summary.",
  );
  assertThrows(
    // @ts-expect-error Verify that untyped JavaScript callers get a clear error.
    () => table.addSummaryRows("all", "statistic", "count"),
    Error,
    'addSummaryRows() summary "count" is not supported.',
  );

  await sdb.close();
});

Deno.test("addSummaryRows() validates selected and label columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  const nonNumeric = sdb.newTable("nonNumericSummary");
  nonNumeric.loadArray([{ statistic: "a", note: "one", value: 1 }]);
  nonNumeric.addSummaryRows("note", "statistic", "sum");
  await assertRejects(
    () => nonNumeric.run(),
    Error,
    'addSummaryRows() requires numeric columns, but "note" has type VARCHAR.',
  );

  const numericLabel = sdb.newTable("numericLabel");
  numericLabel.loadArray([{ statistic: 1, value: 2 }]);
  numericLabel.addSummaryRows("value", "statistic", "sum");
  await assertRejects(
    () => numericLabel.run(),
    Error,
    'addSummaryRows() label column "statistic" must have type VARCHAR, but has type DOUBLE.',
  );

  await sdb.close();
});
