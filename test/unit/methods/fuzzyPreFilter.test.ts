import { assert, assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("fuzzyJoin: should work with preFilterLenDiffRatio", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  await tableA.loadArray([
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
    { id: 3, name: "This is a very long name" },
  ]);
  const tableB = sdb.newTable("tableB");
  await tableB.loadArray([
    { idB: 1, nameB: "Alise" }, // length 5 vs 5, diff 0
    { idB: 2, nameB: "Bobb" }, // length 3 vs 4, diff 1. 1 <= 0.5 * 3 (1.5)
    { idB: 3, nameB: "This is a very long name indeed" }, // length 24 vs 31, diff 7. 7 <= 0.5 * 24 (12)
  ]);

  // With a ratio of 0.5, all should still match
  await tableA.fuzzyJoin(tableB, "name", "nameB", {
    preFilterLenDiffRatio: 0.5,
    threshold: 50,
  });

  const data = await tableA.getData();
  assertEquals(data.length, 3);
  assertEquals(data.filter((d) => d.nameB !== null).length, 3);

  await sdb.done();
});

Deno.test("fuzzyJoin: should filter out rows with preFilterLenDiffRatio", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  await tableA.loadArray([
    { id: 1, name: "Alice" },
  ]);
  const tableB = sdb.newTable("tableB");
  await tableB.loadArray([
    { idB: 1, nameB: "Alice with many more characters" },
  ]);

  // Alice (5) vs Alice with... (31)
  // Diff = 26. 26 > 0.1 * 5 (0.5). Should NOT match.
  await tableA.fuzzyJoin(tableB, "name", "nameB", {
    preFilterLenDiffRatio: 0.1,
    threshold: 10,
  });

  const data = await tableA.getData();
  assertEquals(data[0].nameB, null);

  await sdb.done();
});

Deno.test("fuzzyJoin: should work with preFilterPrefixLen", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  await tableA.loadArray([
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" },
  ]);
  const tableB = sdb.newTable("tableB");
  await tableB.loadArray([
    { idB: 1, nameB: "Alise" },
    { idB: 2, nameB: "Bobb" },
  ]);

  // Prefix len 2: "Al" matches "Al", "Bo" matches "Bo"
  await tableA.fuzzyJoin(tableB, "name", "nameB", {
    preFilterPrefixLen: 2,
    threshold: 50,
  });

  const data = await tableA.getData();
  assertEquals(data.filter((d) => d.nameB !== null).length, 2);

  await sdb.done();
});

Deno.test("fuzzyJoin: should filter out rows with preFilterPrefixLen", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  await tableA.loadArray([
    { id: 1, name: "Alice" },
  ]);
  const tableB = sdb.newTable("tableB");
  await tableB.loadArray([
    { idB: 1, nameB: "Elice" },
  ]);

  // Prefix len 1: "A" vs "E". Should NOT match.
  await tableA.fuzzyJoin(tableB, "name", "nameB", {
    preFilterPrefixLen: 1,
    threshold: 10,
  });

  const data = await tableA.getData();
  assertEquals(data[0].nameB, null);

  await sdb.done();
});

Deno.test("fuzzyJoin: should throw error when using preFilterLenDiffRatio with partial_ratio", async () => {
  const sdb = new SimpleDB();
  const tableA = sdb.newTable("tableA");
  await tableA.loadArray([{ name: "Alice" }]);
  const tableB = sdb.newTable("tableB");
  await tableB.loadArray([{ nameB: "Alise" }]);

  await assertRejects(
    () =>
      tableA.fuzzyJoin(tableB, "name", "nameB", {
        method: "partial_ratio",
        preFilterLenDiffRatio: 0.5,
      }),
    Error,
    "preFilterLenDiffRatio is not supported with method 'partial_ratio'",
  );

  await sdb.done();
});

Deno.test("fuzzyClean: should work with pre-filters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("table");
  await table.loadArray([
    { name: "Alice" },
    { name: "Alise" },
    { name: "Bob" },
    { name: "Bobb" },
    { name: "Very long name" },
  ]);

  // Clean with preFilterLenDiffRatio=0.5 and preFilterPrefixLen=2
  // Alice & Alise: length 5&5 (diff 0 <= 1), prefix "Al" (matches). Score high. -> Clustered.
  // Bob & Bobb: length 3&4 (diff 1 <= 1.5). prefix "Bo" (matches). Score high. -> Clustered.
  // Very long name: No matches.
  await table.fuzzyClean("name", "nameClean", {
    preFilterLenDiffRatio: 0.5,
    preFilterPrefixLen: 2,
    threshold: 50,
  });

  const data = await table.getData();
  // Alice and Alise should be same
  const aliceClean = data.find((d) => d.name === "Alice")?.nameClean;
  const aliseClean = data.find((d) => d.name === "Alise")?.nameClean;
  assert(aliceClean !== undefined);
  assertEquals(aliceClean, aliseClean);

  // Bob and Bobb should be same
  const bobClean = data.find((d) => d.name === "Bob")?.nameClean;
  const bobbClean = data.find((d) => d.name === "Bobb")?.nameClean;
  assert(bobClean !== undefined);
  assert(bobbClean !== undefined);
  assertEquals(bobClean, bobbClean);

  await sdb.done();
});

Deno.test("fuzzyClean: should filter out clusters with preFilterPrefixLen", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("table");
  await table.loadArray([
    { name: "Alice" },
    { name: "Elice" },
  ]);

  // High similarity, but different prefix
  await table.fuzzyClean("name", "nameClean", {
    preFilterPrefixLen: 1,
    threshold: 80,
  });

  const data = await table.getData();
  // With no matches, fuzzyClean doesn't create the new column unless it already existed
  // Wait, if newColumn !== column, it should still create it and copy values.
  // Let me check src/methods/fuzzyClean.ts
  assertEquals(data.find((d) => d.name === "Alice")?.nameClean, "Alice");
  assertEquals(data.find((d) => d.name === "Elice")?.nameClean, "Elice");

  await sdb.done();
});

Deno.test("fuzzyClean: should throw error when using preFilterLenDiffRatio with partial_ratio", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("table");
  await table.loadArray([{ name: "Alice" }]);

  await assertRejects(
    () =>
      table.fuzzyClean("name", "nameClean", {
        method: "partial_ratio",
        preFilterLenDiffRatio: 0.5,
      }),
    Error,
    "preFilterLenDiffRatio is not supported with method 'partial_ratio'",
  );

  await sdb.done();
});
