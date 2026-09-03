import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the vertical proportions in a new column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.columnProportions("key2", "key2Perc");
  const data = await table.getData();

  assertEquals(data, [
    {
      key1: "Rubarbe",
      key2: 1,
      key3: 10.5,
      key2Perc: 0.027777777777777776,
    },
    {
      key1: "Fraise",
      key2: 11,
      key3: 2.345,
      key2Perc: 0.3055555555555556,
    },
    {
      key1: "Rubarbe",
      key2: 2,
      key3: 4.5657,
      key2Perc: 0.05555555555555555,
    },
    {
      key1: "Fraise",
      key2: 22,
      key3: 12.3434,
      key2Perc: 0.6111111111111112,
    },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2Perc: null,
    },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2Perc: null,
    },
  ]);
  await sdb.close();
});

Deno.test("should return the vertical proportions in a new column and a specific number of decimals", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.columnProportions("key2", "key2Prop", {
    decimals: 4,
  });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "Rubarbe", key2: 1, key3: 10.5, key2Prop: 0.0278 },
    { key1: "Fraise", key2: 11, key3: 2.345, key2Prop: 0.3056 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, key2Prop: 0.0556 },
    { key1: "Fraise", key2: 22, key3: 12.3434, key2Prop: 0.6111 },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2Prop: null,
    },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2Prop: null,
    },
  ]);
  await sdb.close();
});

Deno.test("should scale vertical proportions to a custom base", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { group: "A", value: 1 },
    { group: "A", value: 3 },
    { group: "B", value: 2 },
    { group: "B", value: 8 },
  ]);
  table.columnProportions("value", "percentage", {
    by: "group",
    base: 100,
    decimals: 1,
  });

  assertEquals(await table.getData(), [
    { group: "A", value: 1, percentage: 25 },
    { group: "A", value: 3, percentage: 75 },
    { group: "B", value: 2, percentage: 20 },
    { group: "B", value: 8, percentage: 80 },
  ]);
  await sdb.close();
});

Deno.test("should reject an invalid vertical proportion base", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () => table.columnProportions("value", "percentage", { base: 0 }),
    Error,
    "columnProportions() options.base must be a finite number greater than 0",
  );

  await sdb.close();
});

Deno.test("should return the vertical proportions in a new column with a category", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.columnProportions("key2", "key2Perc", {
    by: "key1",
  });
  table.sort({
    key1: "asc",
    key2Perc: "asc",
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2Perc: null,
    },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key2Perc: null,
    },
    {
      key1: "Fraise",
      key2: 11,
      key3: 2.345,
      key2Perc: 0.3333333333333333,
    },
    {
      key1: "Fraise",
      key2: 22,
      key3: 12.3434,
      key2Perc: 0.6666666666666666,
    },
    {
      key1: "Rubarbe",
      key2: 1,
      key3: 10.5,
      key2Perc: 0.3333333333333333,
    },
    {
      key1: "Rubarbe",
      key2: 2,
      key3: 4.5657,
      key2Perc: 0.6666666666666666,
    },
  ]);
  await sdb.close();
});

Deno.test("should return the vertical proportions in a new column by multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataSummarize.json"]);
  table.columnProportions("key3", "key3Perc", {
    by: ["key1", "key2"],
  });
  table.sort({
    key1: "asc",
    key2: "asc",
    key3Perc: "asc",
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key3Perc: null,
    },
    {
      key1: "Banane",
      key2: null,
      key3: null,
      key3Perc: null,
    },
    { key1: "Fraise", key2: 11, key3: 2.345, key3Perc: 1 },
    { key1: "Fraise", key2: 22, key3: 12.3434, key3Perc: 1 },
    { key1: "Rubarbe", key2: 1, key3: 10.5, key3Perc: 1 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, key3Perc: 1 },
  ]);
  await sdb.close();
});

Deno.test("should throw when the new column name already exists, instead of silently renaming it", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { value: 1, existing: "already here" },
    { value: 2, existing: "x" },
  ]);

  await assertRejects(
    () => table.columnProportions("value", "existing").run(),
    Error,
    'the column "existing" already exists',
  );

  await sdb.close();
});
