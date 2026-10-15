import { test, expect } from "vite-plus/test";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("addSummaryRows() adds a sum row for all numeric columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sales");

  table.loadArray([
    { region: "North", sales: 10, expenses: 4, note: "first" },
    { region: "South", sales: 20, expenses: 6, note: "second" },
  ]);
  table.addSummaryRows("all", "region", { stats: "sum" });

  expect(await table.getData()).toStrictEqual([
    { region: "North", sales: 10, expenses: 4, note: "first" },
    { region: "South", sales: 20, expenses: 6, note: "second" },
    { region: "sum", sales: 30, expenses: 10, note: null },
  ]);

  await sdb.close();
});

test("addSummaryRows() accepts mixed stat strings and objects", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectedSales");

  table.loadArray([
    { region: "North", sales: 10, expenses: 4 },
    { region: "South", sales: 20, expenses: 6 },
  ]);
  table.addSummaryRows(["sales"], "region", {
    stats: ["sum", { stat: "mean", label: "Average" }],
  });

  expect(await table.getData()).toStrictEqual([
    { region: "North", sales: 10, expenses: 4 },
    { region: "South", sales: 20, expenses: 6 },
    { region: "sum", sales: 30, expenses: null },
    { region: "Average", sales: 15, expenses: null },
  ]);

  await sdb.close();
});

test("addSummaryRows() adds every supported column stat when stats are omitted", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("allSummaries");

  table.loadArray([
    { statistic: "a", value: 1 },
    { statistic: "b", value: 2 },
    { statistic: "c", value: null },
  ]);
  table.addSummaryRows("value", "statistic");

  const data = await table.getData();
  expect(data.slice(3).map((row) => row.statistic)).toStrictEqual([
    "countDistinct",
    "countNull",
    "min",
    "max",
    "mean",
    "median",
    "sum",
    "skew",
    "stdDev",
    "variance",
  ]);
  expect(data.find((row) => row.statistic === "countNull")?.value).toStrictEqual(1);

  await sdb.close();
});

test("addSummaryRows() can add summary rows at the top", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("topSummaries");

  table.loadArray([
    { statistic: "a", value: 10 },
    { statistic: "b", value: 20 },
  ]);
  table.addSummaryRows("value", "statistic", {
    stats: ["sum", "mean"],
    position: "top",
  });

  expect(await table.getData()).toStrictEqual([
    { statistic: "sum", value: 30 },
    { statistic: "mean", value: 15 },
    { statistic: "a", value: 10 },
    { statistic: "b", value: 20 },
  ]);

  await sdb.close();
});

test("addSummaryRows() computes every row from the original input", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("originalInput");

  table.loadArray([
    { statistic: "a", value: 10 },
    { statistic: "b", value: 20 },
  ]);
  table.addSummaryRows("value", "statistic", {
    stats: ["sum", "mean"],
  });

  const data = await table.getData();
  expect(data.slice(2)).toStrictEqual([
    { statistic: "sum", value: 30 },
    { statistic: "mean", value: 15 },
  ]);

  await sdb.close();
});

test("addSummaryRows() binds custom labels", async () => {
  const sdb = new SimpleDB({ logSQL: true });
  const table = sdb.newTable("boundLabels");

  const logs: unknown[][] = [];
  let data: { [key: string]: unknown }[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args);
  try {
    table.loadArray([{ statistic: "a", value: 2 }]);
    await table.run();
    table.addSummaryRows("all", "statistic", {
      stats: {
        stat: "sum",
        label: "Owner's total",
      },
    });
    await table.run();
    data = await table.getData();
  } finally {
    console.log = originalLog;
  }

  expect(data.at(-1)).toStrictEqual({
    statistic: "Owner's total",
    value: 2,
  });
  expect(
    logs.some(([message]) => typeof message === "string" && message.includes("CAST(? AS VARCHAR)")),
  ).toStrictEqual(true);
  expect(logs.some(([message]) => message === "Bound values:")).toStrictEqual(true);

  await sdb.close();
});

test("addSummaryRows() fuses with preceding queued methods", async () => {
  const sdb = new SimpleDB({ logSQL: true });
  const table = sdb.newTable("filteredSummary");
  const logs: unknown[][] = [];
  const warnings: unknown[][] = [];
  const originalLog = console.log;
  const originalWarn = console.warn;

  table
    .loadArray([
      { statistic: "a", value: 1 },
      { statistic: "b", value: 2 },
      { statistic: "c", value: 3 },
    ])
    .filter("value >= 2")
    .addSummaryRows("all", "statistic", { stats: "sum" });

  let data: { [key: string]: unknown }[] = [];
  try {
    console.log = (...args: unknown[]) => logs.push(args);
    console.warn = (...args: unknown[]) => warnings.push(args);
    data = await table.getData();
  } finally {
    console.log = originalLog;
    console.warn = originalWarn;
  }

  expect(data).toStrictEqual([
    { statistic: "b", value: 2 },
    { statistic: "c", value: 3 },
    { statistic: "sum", value: 5 },
  ]);
  const fusedStatements = logs.filter(
    ([message]) =>
      typeof message === "string" &&
      message.includes('CREATE OR REPLACE TABLE "filteredSummary" AS WITH'),
  );
  expect(fusedStatements.length).toStrictEqual(1);
  expect(
    typeof fusedStatements[0][0] === "string" &&
      fusedStatements[0][0].includes('SELECT * FROM "s2"'),
  ).toStrictEqual(true);
  expect(warnings).toStrictEqual([]);

  await sdb.close();
});

test("addSummaryRows() rejects empty column and stat arrays", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("emptyOptions");

  assertThrows(
    () => table.addSummaryRows([], "statistic", { stats: "sum" }),
    Error,
    'addSummaryRows() requires at least one column or "all".',
  );
  assertThrows(
    () => table.addSummaryRows("all", "statistic", { stats: [] }),
    Error,
    "addSummaryRows() stats cannot be an empty array. Omit stats to add every supported stat.",
  );
  assertThrows(
    // @ts-expect-error Verify that untyped JavaScript callers get a clear error.
    () => table.addSummaryRows("all", "statistic", { stats: "count" }),
    Error,
    'addSummaryRows() stat "count" is not supported.',
  );
  assertThrows(
    // @ts-expect-error Verify that untyped JavaScript callers get a clear error.
    () => table.addSummaryRows("all", "statistic", { position: "middle" }),
    Error,
    'addSummaryRows() options.position must be "top" or "bottom". Received "middle".',
  );

  await sdb.close();
});

test("addSummaryRows() validates selected and label columns", async () => {
  const sdb = new SimpleDB();

  const nonNumeric = sdb.newTable("nonNumericSummary");
  nonNumeric.loadArray([{ statistic: "a", note: "one", value: 1 }]);
  nonNumeric.addSummaryRows("note", "statistic", { stats: "sum" });
  await assertRejects(
    () => nonNumeric.run(),
    Error,
    'addSummaryRows() requires numeric columns, but "note" has type VARCHAR.',
  );

  const numericLabel = sdb.newTable("numericLabel");
  numericLabel.loadArray([{ statistic: 1, value: 2 }]);
  numericLabel.addSummaryRows("value", "statistic", { stats: "sum" });
  await assertRejects(
    () => numericLabel.run(),
    Error,
    'addSummaryRows() label column "statistic" must have type VARCHAR, but has type DOUBLE.',
  );

  await sdb.close();
});
