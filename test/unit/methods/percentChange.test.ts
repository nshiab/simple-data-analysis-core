import { expect, test } from "vite-plus/test";
import SimpleDB from "../../../src/class/SimpleDB.ts";

test("adds fractional changes from the reference column on each row", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  const rows = [
    { value: 125, 'reference "value"': 100 },
    { value: 60, 'reference "value"': 80 },
    { value: -75, 'reference "value"': -100 },
    { value: 100, 'reference "value"': 100 },
    { value: 100, 'reference "value"': 0 },
    { value: 100, 'reference "value"': null },
    { value: null, 'reference "value"': 100 },
  ];
  table.loadArray(rows).percentChange("value", 'reference "value"', "change");

  const changes = [0.25, -0.25, -0.25, 0, null, null, null];
  expect(await table.getData()).toStrictEqual(
    rows.map((row, i) => ({ ...row, change: changes[i] })),
  );
  await sdb.close();
});

test("compares each row to its group mean and rounds after scaling", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table
    .loadArray([
      { id: 1, department: "A", salary: 10 },
      { id: 2, department: "B", salary: 10 },
      { id: 3, department: "A", salary: 20 },
      { id: 4, department: "B", salary: 30 },
      { id: 5, department: "A", salary: null },
    ])
    .percentChange("salary", { stat: "mean", by: "department" }, "change", {
      base: 100,
      decimals: 1,
    })
    .sort({ id: "asc" });

  expect(await table.getValues("change")).toStrictEqual([-33.3, -50, 33.3, 50, null]);
  await sdb.close();
});

test("can use another column's median across multiple grouping columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table
    .loadArray([
      { id: 1, region: "A", year: 2025, salary: 15, budget: 6 },
      { id: 2, region: "A", year: 2025, salary: 10, budget: 14 },
      { id: 3, region: "A", year: 2026, salary: 20, budget: 25 },
      { id: 4, region: "B", year: 2025, salary: 20, budget: 0 },
      { id: 5, region: "B", year: 2026, salary: 20, budget: null },
    ])
    .percentChange(
      "salary",
      { stat: "median", column: "budget", by: ["region", "year"] },
      "change",
      {
        base: 1000,
      },
    )
    .sort({ id: "asc" });

  expect(await table.getValues("change")).toStrictEqual([500, 0, -200, null, null]);
  await sdb.close();
});

test("can compare against table-wide extrema", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table
    .loadArray([{ value: 20 }, { value: 40 }])
    .percentChange("value", { stat: "min" }, "changeFromMin")
    .percentChange("value", { stat: "max" }, "changeFromMax")
    .sort({ value: "asc" });

  expect(await table.getData()).toStrictEqual([
    { value: 20, changeFromMin: 0, changeFromMax: -0.5 },
    { value: 40, changeFromMin: 1, changeFromMax: 0 },
  ]);
  await sdb.close();
});

test("handles decreases between unsigned columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("unsigned_values");
  await sdb.customQuery(
    "CREATE TABLE unsigned_values AS SELECT 6::UBIGINT AS value, 8::UBIGINT AS baseline",
  );

  expect(
    await table.percentChange("value", "baseline", "change").getValues("change"),
  ).toStrictEqual([-0.25]);
  await sdb.close();
});

test("rejects invalid scaling, rounding, and output names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ value: 2, baseline: 1 }]);

  expect(() => table.percentChange("value", "baseline", "change", { base: 0 })).toThrow(
    /options\.base/,
  );
  expect(() => table.percentChange("value", "baseline", "change", { decimals: 0.5 })).toThrow(
    /options\.decimals/,
  );
  await expect(table.percentChange("value", "baseline", "value").run()).rejects.toThrow(
    /already exists/,
  );
  await sdb.close();
});
