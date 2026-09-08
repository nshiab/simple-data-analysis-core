import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the horizontal proportions in new columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataProportions.json"]);
  table.rowProportions(["key1", "key2", "key3"]);
  const data = await table.getData();

  assertEquals(data, [
    {
      key1: 1,
      key2: 2,
      key3: 3,
      key1Perc: 0.16666666666666666,
      key2Perc: 0.3333333333333333,
      key3Perc: 0.5,
    },
    {
      key1: 4,
      key2: 5,
      key3: 6,
      key1Perc: 0.26666666666666666,
      key2Perc: 0.3333333333333333,
      key3Perc: 0.4,
    },
    {
      key1: 7,
      key2: 8,
      key3: 9,
      key1Perc: 0.2916666666666667,
      key2Perc: 0.3333333333333333,
      key3Perc: 0.375,
    },
  ]);

  await sdb.close();
});

Deno.test("should return the horizontal proportions in new columns with a specific suffix", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataProportions.json"]);
  table.rowProportions(["key1", "key2", "key3"], {
    suffix: "Prop",
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      key1: 1,
      key2: 2,
      key3: 3,
      key1Prop: 0.16666666666666666,
      key2Prop: 0.3333333333333333,
      key3Prop: 0.5,
    },
    {
      key1: 4,
      key2: 5,
      key3: 6,
      key1Prop: 0.26666666666666666,
      key2Prop: 0.3333333333333333,
      key3Prop: 0.4,
    },
    {
      key1: 7,
      key2: 8,
      key3: 9,
      key1Prop: 0.2916666666666667,
      key2Prop: 0.3333333333333333,
      key3Prop: 0.375,
    },
  ]);

  await sdb.close();
});

Deno.test("should return the horizontal proportions in new columns with a specific suffix and 4 decimals", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataProportions.json"]);
  table.rowProportions(["key1", "key2", "key3"], {
    suffix: "Prop",
    decimals: 4,
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      key1: 1,
      key2: 2,
      key3: 3,
      key1Prop: 0.1667,
      key2Prop: 0.3333,
      key3Prop: 0.5,
    },
    {
      key1: 4,
      key2: 5,
      key3: 6,
      key1Prop: 0.2667,
      key2Prop: 0.3333,
      key3Prop: 0.4,
    },
    {
      key1: 7,
      key2: 8,
      key3: 9,
      key1Prop: 0.2917,
      key2Prop: 0.3333,
      key3Prop: 0.375,
    },
  ]);

  await sdb.close();
});

Deno.test("should scale horizontal proportions to a custom base", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ a: 1, b: 2, c: 7 }]);
  table.rowProportions(["a", "b", "c"], {
    suffix: "Share",
    base: 1_000,
    decimals: 0,
  });

  assertEquals(await table.getData(), [
    {
      a: 1,
      b: 2,
      c: 7,
      aShare: 100,
      bShare: 200,
      cShare: 700,
    },
  ]);
  await sdb.close();
});

Deno.test("should reject an invalid horizontal proportion base", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () => table.rowProportions(["a", "b"], { base: Number.POSITIVE_INFINITY }),
    Error,
    "rowProportions() options.base must be a finite number greater than 0",
  );

  await sdb.close();
});

Deno.test("should throw when a new column name already exists, instead of silently renaming it", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ a: 1, b: 2, aPerc: "already here" }]);

  await assertRejects(
    () => table.rowProportions(["a", "b"]).run(),
    Error,
    'the column "aPerc" already exists',
  );

  await sdb.close();
});
