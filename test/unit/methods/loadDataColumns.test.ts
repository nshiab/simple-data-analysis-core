import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

// --- Basic column filtering ---

Deno.test("loadData: should load only specific columns from a CSV file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData(["test/data/files/data.csv"], {
    columns: ["key1"],
  });

  const data = await table.getData();

  assertEquals(data, [
    { key1: "1" },
    { key1: "3" },
    { key1: "8" },
    { key1: "brioche" },
  ]);
  await sdb.done();
});

Deno.test("loadData: should load multiple specific columns from a CSV file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData(["test/data/files/data.csv"], {
    columns: ["key2", "key1"],
  });

  const data = await table.getData();

  assertEquals(data, [
    { key2: "2", key1: "1" },
    { key2: "coucou", key1: "3" },
    { key2: "10", key1: "8" },
    { key2: "croissant", key1: "brioche" },
  ]);
  await sdb.done();
});

Deno.test("loadData: should load only specific columns from a JSON file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData(["test/data/files/data.json"], {
    columns: ["key2"],
  });

  const data = await table.getData();

  assertEquals(data, [
    { key2: "un" },
    { key2: "deux" },
    { key2: "trois" },
    { key2: "quatre" },
  ]);
  await sdb.done();
});

Deno.test("loadData: should load only specific columns from a Parquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData(["test/data/files/data.parquet"], {
    columns: ["key1"],
  });

  const data = await table.getData();

  assertEquals(data, [
    { key1: 1 },
    { key1: 3 },
    { key1: 8 },
    { key1: 3 },
  ]);
  await sdb.done();
});

// --- Empty array behaves like no columns option ---

Deno.test("loadData: empty columns array should load all columns (CSV)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData(["test/data/files/data.csv"], {
    columns: [],
  });

  const data = await table.getData();

  assertEquals(data, [
    { key1: "1", key2: "2" },
    { key1: "3", key2: "coucou" },
    { key1: "8", key2: "10" },
    { key1: "brioche", key2: "croissant" },
  ]);
  await sdb.done();
});

// --- Invalid column names (DuckDB throws native error) ---

Deno.test("loadData: invalid column name should throw a DuckDB error", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  await assertRejects(
    () =>
      table.loadData(["test/data/files/data.csv"], {
        columns: ["nonexistent_column"],
      }),
  );

  await sdb.done();
});

// --- loadDataFromDirectory with columns ---

Deno.test("loadDataFromDirectory: should load only specific columns from directory", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadDataFromDirectory("test/data/directory/", {
    unifyColumns: true,
    columns: ["key1"],
  });

  await table.sort({ key1: "asc" });
  const data = await table.getData();

  assertEquals(data, [
    { key1: 1 },
    { key1: 2 },
    { key1: 3 },
    { key1: 4 },
    { key1: 5 },
    { key1: 6 },
    { key1: 7 },
    { key1: 8 },
    { key1: 9 },
    { key1: 9 },
    { key1: 10 },
    { key1: 10 },
    { key1: 11 },
    { key1: 11 },
  ]);
  await sdb.done();
});

// --- Excel + columns throws error ---

Deno.test("loadData: combining columns with Excel files should throw an error", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  await assertRejects(
    () =>
      table.loadData(["test/data/files/populations-one-sheet.xlsx"], {
        columns: ["Country"],
      }),
    Error,
    "columns",
  );

  await sdb.done();
});

Deno.test("loadData: combining columns with Excel files (by fileType) should throw an error", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  await assertRejects(
    () =>
      table.loadData(["test/data/files/populations-one-sheet.xlsx"], {
        fileType: "excel",
        columns: ["Country"],
      }),
    Error,
    "columns",
  );

  await sdb.done();
});
