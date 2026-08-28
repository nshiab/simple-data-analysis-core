import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SDAError from "../../../src/class/SDAError.ts";

Deno.test("should normalize values in a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");

  table.normalize("key2", "normalized");
  table.sort({ normalized: "asc" });

  const data = await table.getData();

  assertEquals(data, [
    { key1: "Rubarbe", key2: 1, key3: 10.5, normalized: 0 },
    {
      key1: "Rubarbe",
      key2: 2,
      key3: 4.5657,
      normalized: 0.047619047619047616,
    },
    {
      key1: "Fraise",
      key2: 11,
      key3: 2.345,
      normalized: 0.47619047619047616,
    },
    { key1: "Fraise", key2: 22, key3: 12.3434, normalized: 1 },
    { key1: "Banane", key2: null, key3: null, normalized: null },
    { key1: "Banane", key2: null, key3: null, normalized: null },
  ]);

  await sdb.close();
});

Deno.test("should normalize values in a column with two decimals", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");

  table.normalize("key2", "normalized", {
    decimals: 2,
  });
  table.sort({ normalized: "asc" });

  const data = await table.getData();

  assertEquals(data, [
    { key1: "Rubarbe", key2: 1, key3: 10.5, normalized: 0 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, normalized: 0.05 },
    { key1: "Fraise", key2: 11, key3: 2.345, normalized: 0.48 },
    { key1: "Fraise", key2: 22, key3: 12.3434, normalized: 1 },
    { key1: "Banane", key2: null, key3: null, normalized: null },
    { key1: "Banane", key2: null, key3: null, normalized: null },
  ]);

  await sdb.close();
});

Deno.test("should normalize values in a column and keep 4 decimals", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");

  table.normalize("key2", "normalized", {
    decimals: 4,
  });
  table.sort({ normalized: "asc" });

  const data = await table.getData();

  assertEquals(data, [
    { key1: "Rubarbe", key2: 1, key3: 10.5, normalized: 0 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, normalized: 0.0476 },
    { key1: "Fraise", key2: 11, key3: 2.345, normalized: 0.4762 },
    { key1: "Fraise", key2: 22, key3: 12.3434, normalized: 1 },
    { key1: "Banane", key2: null, key3: null, normalized: null },
    { key1: "Banane", key2: null, key3: null, normalized: null },
  ]);

  await sdb.close();
});

Deno.test("should normalize values by a grouping column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");

  table.normalize("key2", "normalized", {
    by: "key1",
  });
  table.sort({ key3: "asc" });

  const data = await table.getData();

  assertEquals(data, [
    { key1: "Fraise", key2: 11, key3: 2.345, normalized: 0 },
    { key1: "Rubarbe", key2: 2, key3: 4.5657, normalized: 1 },
    { key1: "Rubarbe", key2: 1, key3: 10.5, normalized: 0 },
    { key1: "Fraise", key2: 22, key3: 12.3434, normalized: 1 },
    { key1: "Banane", key2: null, key3: null, normalized: null },
    { key1: "Banane", key2: null, key3: null, normalized: null },
  ]);

  await sdb.close();
});

Deno.test("should normalize data with positive and negative values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { key1: -1 },
    { key1: -0.5 },
    { key1: 0 },
    { key1: 0.5 },
    { key1: 1 },
  ]);

  table.normalize("key1", "normalized");
  table.sort({ key1: "asc" });

  const data = await table.getData();

  assertEquals(data, [
    { key1: -1, normalized: 0 },
    { key1: -0.5, normalized: 0.25 },
    { key1: 0, normalized: 0.5 },
    { key1: 0.5, normalized: 0.75 },
    { key1: 1, normalized: 1 },
  ]);

  await sdb.close();
});

Deno.test("should normalize values to a custom range", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { value: 10 },
    { value: 15 },
    { value: 20 },
    { value: null },
  ]);

  table.normalize("value", "normalized", { range: [0, 10] });

  assertEquals(await table.getData(), [
    { value: 10, normalized: 0 },
    { value: 15, normalized: 5 },
    { value: 20, normalized: 10 },
    { value: null, normalized: null },
  ]);

  await sdb.close();
});

Deno.test("should normalize values to a custom range with an offset and rounding", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ value: 0 }, { value: 1 }, { value: 3 }]);

  table.normalize("value", "normalized", {
    range: [-1, 1],
    decimals: 2,
  });

  assertEquals(await table.getData(), [
    { value: 0, normalized: -1 },
    { value: 1, normalized: -0.33 },
    { value: 3, normalized: 1 },
  ]);

  await sdb.close();
});

Deno.test("should reject an invalid custom range", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  for (const range of [[1, 1], [10, 0], [0, Infinity]] as const) {
    assertThrows(
      () => table.normalize("value", "normalized", { range: [...range] }),
      Error,
      "normalize() options.range must contain two finite numbers in ascending order.",
    );
  }

  await sdb.close();
});

Deno.test("should report column and newColumn in a thrown SDAError's parameters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ key1: 1 }]);

  table.normalize("aColumnThatDoesNotExist", "normalized");

  let error: unknown;
  try {
    await table.getData();
  } catch (e) {
    error = e;
  }

  assertEquals(error instanceof SDAError, true);
  const sdaError = error as SDAError;
  assertEquals(sdaError.method, "normalize()");
  assertEquals(sdaError.parameters, {
    column: "aColumnThatDoesNotExist",
    newColumn: "normalized",
    options: {},
  });

  await sdb.close();
});

Deno.test("should throw when the new column name already exists, instead of silently renaming it", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ key1: 1, normalized: "already here" }]);

  await assertRejects(
    () => table.normalize("key1", "normalized").run(),
    Error,
    'the column "normalized" already exists',
  );

  await sdb.close();
});
