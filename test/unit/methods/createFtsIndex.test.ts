import { assertEquals, assertExists } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should successfully create an FTS index", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // Create FTS index
  const result = await table.createFtsIndex("Dish", "Recipe").run();

  // Should return the table for chaining
  assertEquals(result, table);

  // Index should be in the indexes array
  assertExists(
    table.indexes.find((idx) => idx.includes("fts_index")),
  );

  // Should be able to use bm25 after creating index
  table.bm25("italian food", "Dish", "Recipe", 5);
  const dishes = await table.getValues("Dish");
  assertEquals(dishes.sort(), [
    "Carbonara",
    "Escarole Soup",
    "Pizza",
    "Risotto",
    "Tiramisu",
  ]);
});

Deno.test("should successfully create an FTS index with a specific stemmer", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // Create FTS index with French stemmer
  await table.createFtsIndex("Dish", "Recipe", {
    stemmer: "french",
  }).run();

  // Index should be in the indexes array
  assertExists(
    table.indexes.find((idx) => idx.includes("fts_index")),
  );

  // Should work with bm25
  table.bm25("french food", "Dish", "Recipe", 5, {
    stemmer: "french",
  });
  const dishes = await table.getValues("Dish");
  assertEquals(dishes.length, 5);
});

Deno.test("should not recreate index if already exists", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // Create FTS index
  await table.createFtsIndex("Dish", "Recipe", {
    verbose: true,
  }).run();

  const indexCountBefore =
    table.indexes.filter((idx) => idx.includes("fts_index")).length;

  // Try to create the same index again
  await table.createFtsIndex("Dish", "Recipe", {
    verbose: true,
  }).run();

  const indexCountAfter =
    table.indexes.filter((idx) => idx.includes("fts_index")).length;

  // Should have the same number of indexes (no duplicate)
  assertEquals(indexCountBefore, indexCountAfter);
  assertEquals(indexCountBefore, 1);
});

Deno.test("should recreate index when overwrite is true", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // Create initial FTS index
  await table.createFtsIndex("Dish", "Recipe", {
    stemmer: "porter",
  }).run();

  // Index should exist
  const indexCountBefore =
    table.indexes.filter((idx) => idx.includes("fts_index")).length;
  assertEquals(indexCountBefore, 1);

  // Recreate index with overwrite=true
  await table.createFtsIndex("Dish", "Recipe", {
    stemmer: "english",
    overwrite: true,
  }).run();

  // Index should still exist (only one)
  const indexCountAfter =
    table.indexes.filter((idx) => idx.includes("fts_index")).length;
  assertEquals(indexCountAfter, 1);

  // Should work with bm25
  table.bm25("italian food", "Dish", "Recipe", 5);
  const dishes = await table.getValues("Dish");
  assertEquals(dishes.length, 5);
});

Deno.test("should create index when overwrite is true and no index exists", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // Create index with overwrite=true even though no index exists
  await table.createFtsIndex("Dish", "Recipe", {
    overwrite: true,
  }).run();

  // Index should be created
  assertExists(
    table.indexes.find((idx) => idx.includes("fts_index")),
  );

  // Should work with bm25
  table.bm25("italian food", "Dish", "Recipe", 5);
  const dishes = await table.getValues("Dish");
  assertEquals(dishes.sort(), [
    "Carbonara",
    "Escarole Soup",
    "Pizza",
    "Risotto",
    "Tiramisu",
  ]);
});

Deno.test("should recreate index with verbose logging when overwrite is true", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // Create initial index
  await table.createFtsIndex("Dish", "Recipe", {
    verbose: true,
  }).run();

  const indexCountBefore =
    table.indexes.filter((idx) => idx.includes("fts_index")).length;

  // Recreate with overwrite
  await table.createFtsIndex("Dish", "Recipe", {
    overwrite: true,
    verbose: true,
  }).run();

  const indexCountAfter =
    table.indexes.filter((idx) => idx.includes("fts_index")).length;

  // Should still have exactly one index
  assertEquals(indexCountBefore, 1);
  assertEquals(indexCountAfter, 1);

  // Should work with bm25
  table.bm25("italian food", "Dish", "Recipe", 5);
  const dishes = await table.getValues("Dish");
  assertEquals(dishes.length, 5);
});

Deno.test("should successfully create an FTS index with custom parameters", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // Create FTS index with multiple new parameters
  await table.createFtsIndex("Dish", "Recipe", {
    stemmer: "none",
    lower: false,
    stripAccents: false,
    verbose: true,
  }).run();

  // Index should be in the indexes array
  assertExists(
    table.indexes.find((idx) => idx.includes("fts_index")),
  );

  // Verifying the search still works with these parameters
  table.bm25("italian food", "Dish", "Recipe", 5, {
    stemmer: "none",
    lower: false,
    stripAccents: false,
  });
  const dishes = await table.getValues("Dish");
  assertEquals(dishes.length, 5);
});
