import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should add the cumulative sum in a new column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ key1: 1 }, { key1: 2 }, { key1: 3 }]);
  table.accumulate("key1", "cumulative");
  const data = await table.getData();
  expect(data).toStrictEqual([
    { key1: 1, cumulative: 1 },
    { key1: 2, cumulative: 3 },
    { key1: 3, cumulative: 6 },
  ]);
  await sdb.close();
});

test("should round the cumulative sums after adding the original values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ amount: 1.234 }, { amount: 0.234 }]);
  table.accumulate("amount", "cumulative", { decimals: 2 });
  expect(await table.getData()).toStrictEqual([
    { amount: 1.234, cumulative: 1.23 },
    { amount: 0.234, cumulative: 1.47 },
  ]);
  await sdb.close();
});

test("should round grouped cumulative sums to whole numbers with zero decimals", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { amount: 1.4, category: "a" },
    { amount: 2.6, category: "b" },
    { amount: 1.4, category: "a" },
  ]);
  table.accumulate("amount", "cumulative", { by: "category", decimals: 0 });
  expect(await table.getData()).toStrictEqual([
    { amount: 1.4, category: "a", cumulative: 1 },
    { amount: 2.6, category: "b", cumulative: 3 },
    { amount: 1.4, category: "a", cumulative: 3 },
  ]);
  await sdb.close();
});

test("should add the cumulative sum in a new column without reordering the rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([{ key1: 3 }, { key1: 1 }, { key1: 2 }]);
  table.accumulate("key1", "cumulative");
  const data = await table.getData();
  expect(data).toStrictEqual([
    { key1: 3, cumulative: 3 },
    { key1: 1, cumulative: 4 },
    { key1: 2, cumulative: 6 },
  ]);
  await sdb.close();
});
test("should add the cumulative sum by a grouping column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { key1: 6, key2: "b" },
    { key1: 1, key2: "a" },
    { key1: 4, key2: "b" },
    { key1: 2, key2: "a" },
    { key1: 3, key2: "a" },
    { key1: 5, key2: "b" },
  ]);
  table.accumulate("key1", "cumulative", { by: "key2" });
  const data = await table.getData();
  expect(data).toStrictEqual([
    { key1: 6, key2: "b", cumulative: 6 },
    { key1: 1, key2: "a", cumulative: 1 },
    { key1: 4, key2: "b", cumulative: 10 },
    { key1: 2, key2: "a", cumulative: 3 },
    { key1: 3, key2: "a", cumulative: 6 },
    { key1: 5, key2: "b", cumulative: 15 },
  ]);
  await sdb.close();
});
test("should add the cumulative sum in a new column by multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { key1: 6, key2: "b", key3: "c" },
    { key1: 1, key2: "a", key3: "c" },
    { key1: 4, key2: "b", key3: "c" },
    { key1: 2, key2: "a", key3: "d" },
    { key1: 3, key2: "a", key3: "c" },
    { key1: 5, key2: "b", key3: "d" },
  ]);
  table.accumulate("key1", "cumulative", {
    by: ["key2", "key3"],
  });
  const data = await table.getData();
  expect(data).toStrictEqual([
    { key1: 6, key2: "b", key3: "c", cumulative: 6 },
    { key1: 1, key2: "a", key3: "c", cumulative: 1 },
    { key1: 4, key2: "b", key3: "c", cumulative: 10 },
    { key1: 2, key2: "a", key3: "d", cumulative: 2 },
    { key1: 3, key2: "a", key3: "c", cumulative: 4 },
    { key1: 5, key2: "b", key3: "d", cumulative: 5 },
  ]);
  await sdb.close();
});

test("should throw when the new column name already exists, instead of silently renaming it", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { key1: 1, cumulative: "already here" },
    { key1: 2, cumulative: "x" },
  ]);

  await assertRejects(
    () => table.accumulate("key1", "cumulative").run(),
    Error,
    'the column "cumulative" already exists',
  );

  await sdb.close();
});
