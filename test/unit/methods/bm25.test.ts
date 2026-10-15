import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should sucessfully run a search", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  table.bm25("italian food", "Dish", "Recipe", 5);

  const dishes = await table.getValues("Dish");
  expect(dishes.sort((a, b) => String(a).localeCompare(String(b)))).toStrictEqual([
    "Carbonara",
    "Escarole Soup",
    "Pizza",
    "Risotto",
    "Tiramisu",
  ]);
});
test("should sucessfully run a search with a specific stemmer", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  table.bm25("italian food", "Dish", "Recipe", 5, {
    stemmer: "french",
  });

  const dishes = await table.getValues("Dish");
  expect(dishes.sort((a, b) => String(a).localeCompare(String(b)))).toStrictEqual([
    "Carbonara",
    "Escarole Soup",
    "Pizza",
    "Risotto",
    "Tiramisu",
  ]);
});
test("should sucessfully run a search with a specific b and k", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  table.bm25("italian food", "Dish", "Recipe", 5, {
    k: 0.1,
    b: 0.1,
  });

  const dishes = await table.getValues("Dish");
  expect(dishes.sort((a, b) => String(a).localeCompare(String(b)))).toStrictEqual([
    "Carbonara",
    "Escarole Soup",
    "Pizza",
    "Risotto",
    "Tiramisu",
  ]);
});
test("should sucessfully run a search with output table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  const italian = table.bm25("italian food", "Dish", "Recipe", 5, {
    outputTable: "italian",
  });

  const dishesItalian = await italian.getValues("Dish");
  expect(dishesItalian.sort((a, b) => String(a).localeCompare(String(b)))).toStrictEqual([
    "Carbonara",
    "Escarole Soup",
    "Pizza",
    "Risotto",
    "Tiramisu",
  ]);

  const allDishes = await table.getValues("Dish");
  expect(allDishes.length).toStrictEqual(336);
});
test("should not recreate index if already exists", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  const italian = table.bm25("italian food", "Dish", "Recipe", 5, {
    outputTable: "italian",
    verbose: true,
  });
  const french = table.bm25("french food", "Dish", "Recipe", 5, {
    outputTable: "french",
    verbose: true,
  });

  const dishesItalian = await italian.getValues("Dish");
  expect(dishesItalian.sort((a, b) => String(a).localeCompare(String(b)))).toStrictEqual([
    "Carbonara",
    "Escarole Soup",
    "Pizza",
    "Risotto",
    "Tiramisu",
  ]);

  const dishesFrench = await french.getValues("Dish");
  expect(dishesFrench.sort((a, b) => String(a).localeCompare(String(b)))).toStrictEqual([
    "Chivito",
    "Crepes",
    "Lomo Saltado",
    "Poutine",
    "Quiche Lorraine",
  ]);

  const allDishes = await table.getValues("Dish");
  expect(allDishes.length).toStrictEqual(336);
});

test("should successfully run a search with custom fts options", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  table.bm25("italian food", "Dish", "Recipe", 5, {
    stemmer: "none",
    lower: false,
    stripAccents: false,
  });

  const dishes = await table.getValues("Dish");
  expect(dishes.length).toStrictEqual(5);
});

test("should recreate index with overwriteIndex option", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // First search creates the index
  // bm25() queues the operation; run() executes it.
  await table
    .bm25("italian food", "Dish", "Recipe", 5, {
      stemmer: "porter",
      outputTable: "italian",
    })
    .run();

  const indexCountBefore = table.indexes.filter((idx) => idx.name.includes("fts_index")).length;
  expect(indexCountBefore).toStrictEqual(1);

  // Second search with overwriteIndex recreates the index
  const french = await table
    .bm25("french food", "Dish", "Recipe", 5, {
      stemmer: "english",
      overwriteIndex: true,
      outputTable: "french",
      verbose: true,
    })
    .run();

  const indexCountAfter = table.indexes.filter((idx) => idx.name.includes("fts_index")).length;

  // Should still have only one index
  expect(indexCountAfter).toStrictEqual(1);

  const dishesFrench = await french.getValues("Dish");
  expect(dishesFrench.length).toStrictEqual(5);
});
test("should include the score column when scoreColumn option is provided", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  table.bm25("italian food", "Dish", "Recipe", 5, {
    scoreColumn: "bm25_score",
  });

  const scores = await table.getValues("bm25_score");
  const dishes = await table.getValues("Dish");

  expect(scores.length).toStrictEqual(5);
  expect(typeof scores[0]).toStrictEqual("number");
  expect(dishes.length).toStrictEqual(5);
});

test("should filter out results below minScore", async () => {
  const sdb = new SimpleDB();

  // First, run a standard search to get a baseline score to test against
  const baseTable = sdb.newTable();
  baseTable.loadData("test/data/files/recipes.parquet");
  baseTable.removeDuplicates({ on: "Dish" });
  baseTable.bm25("italian food", "Dish", "Recipe", 5, {
    scoreColumn: "score",
  });

  const allScores = (await baseTable.getValues("score")) as number[];

  // Grab the 3rd highest score to use as our minimum threshold
  // This guarantees the new search should return fewer than 5 results
  const threshold = allScores[2];

  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });
  table.bm25("italian food", "Dish", "Recipe", 5, {
    minScore: threshold,
    scoreColumn: "filtered_score",
  });

  const filteredScores = (await table.getValues("filtered_score")) as number[];
  const dishes = await table.getValues("Dish");

  // It should only return the top 3 items that met or exceeded the threshold
  expect(filteredScores.length).toStrictEqual(3);
  expect(dishes.length).toStrictEqual(3);

  const allValid = filteredScores.every((score) => score >= threshold);
  expect(allValid).toStrictEqual(true);
});

test("should successfully run a search with conjunctive option", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  // "fennel garlic" should match many things with disjunctive (default)
  table.bm25("fennel garlic", "Dish", "Recipe", 30, {
    outputTable: "disjunctive",
  });
  const disjunctive = await sdb.getTable("disjunctive");
  const disjunctiveCount = await disjunctive.getRowCount();

  // With conjunctive, it should only match rows having BOTH tokens
  table.bm25("fennel garlic", "Dish", "Recipe", 30, {
    conjunctive: true,
    outputTable: "conjunctive",
  });
  const conjunctive = await sdb.getTable("conjunctive");
  const conjunctiveCount = await conjunctive.getRowCount();

  // We expect fewer results with conjunctive for "fennel garlic"
  // console.log({ disjunctiveCount, conjunctiveCount });
  expect(conjunctiveCount < disjunctiveCount).toStrictEqual(true);
  expect(conjunctiveCount > 0).toStrictEqual(true);

  // Check that one of the results actually has both words (case-insensitive check on content would be ideal but content is not returned by default)
  // Let's just trust DuckDB's fts extension for now if it doesn't throw.
});

for (const name of ["ranking_probe", "ranking$probe", "Ranking_Épreuve"]) {
  test(`bm25 preserves the FTS table name: ${name}`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable(name).loadArray([
        { id: "a", text: "zebra" },
        { id: "b", text: "other" },
      ]);
      for (const overwriteIndex of [false, false, true]) {
        const result = table.bm25("zebra", "id", "text", 1, {
          outputTable: "result",
          overwriteIndex,
        });
        expect(await result.getValues("id")).toStrictEqual(["a"]);
        await result.removeTable();
        expect(table.indexes.filter(({ kind }) => kind === "fts").length).toStrictEqual(1);
      }
    } finally {
      await sdb.close();
    }
  });
}
