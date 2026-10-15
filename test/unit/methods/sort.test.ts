import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should sort one number column ascendingly", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSort.csv");
  table.sort({ key1: "asc" });

  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 1, key2: "Roi", key3: "A" },
    { key1: 2, key2: "Alambic", key3: "B" },
    { key1: 4, key2: "Extérieur", key3: "B" },
    { key1: 5, key2: "À l'ouest", key3: "A" },
    { key1: 56.7, key2: "Éléphant", key3: "A" },
    { key1: 900, key2: "Zéphir", key3: "A" },
  ]);

  await sdb.close();
});

test("should sort one column with spaces in its name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ "column 1": 2 }, { "column 1": 1 }]);
  table.sort({ "column 1": "asc" });

  const data = await table.getData();

  expect(data).toStrictEqual([{ "column 1": 1 }, { "column 1": 2 }]);

  await sdb.close();
});

test("should sort one number column descendingly", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSort.csv");
  table.sort({ key1: "desc" });
  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 900, key2: "Zéphir", key3: "A" },
    { key1: 56.7, key2: "Éléphant", key3: "A" },
    { key1: 5, key2: "À l'ouest", key3: "A" },
    { key1: 4, key2: "Extérieur", key3: "B" },
    { key1: 2, key2: "Alambic", key3: "B" },
    { key1: 1, key2: "Roi", key3: "A" },
  ]);

  await sdb.close();
});

test("should sort one text column ascendingly with a specific language", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSort.csv");
  table.sort(
    { key2: "asc" },
    {
      lang: { key2: "fr" },
    },
  );
  const data = await table.getData();
  expect(data).toStrictEqual([
    { key1: 5, key2: "À l'ouest", key3: "A" },
    { key1: 2, key2: "Alambic", key3: "B" },
    { key1: 56.7, key2: "Éléphant", key3: "A" },
    { key1: 4, key2: "Extérieur", key3: "B" },
    { key1: 1, key2: "Roi", key3: "A" },
    { key1: 900, key2: "Zéphir", key3: "A" },
  ]);

  await sdb.close();
});

test("should sort one text column descendingly with a specific language", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSort.csv");
  table.sort(
    { key2: "desc" },
    {
      lang: { key2: "fr" },
    },
  );
  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 900, key2: "Zéphir", key3: "A" },
    { key1: 1, key2: "Roi", key3: "A" },
    { key1: 4, key2: "Extérieur", key3: "B" },
    { key1: 56.7, key2: "Éléphant", key3: "A" },
    { key1: 2, key2: "Alambic", key3: "B" },
    { key1: 5, key2: "À l'ouest", key3: "A" },
  ]);

  await sdb.close();
});

test("should sort mutiple columns ascendingly or descendingly with a specific language", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSort.csv");
  table.sort(
    { key3: "asc", key1: "desc" },
    {
      lang: { key2: "fr" },
    },
  );
  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 900, key2: "Zéphir", key3: "A" },
    { key1: 56.7, key2: "Éléphant", key3: "A" },
    { key1: 5, key2: "À l'ouest", key3: "A" },
    { key1: 1, key2: "Roi", key3: "A" },
    { key1: 4, key2: "Extérieur", key3: "B" },
    { key1: 2, key2: "Alambic", key3: "B" },
  ]);

  await sdb.close();
});

test("should sort all columns by defaut, from left to right, in ascending order", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSort.csv");
  table.sort();
  const data = await table.getData();

  expect(data).toStrictEqual([
    { key1: 1, key2: "Roi", key3: "A" },
    { key1: 2, key2: "Alambic", key3: "B" },
    { key1: 4, key2: "Extérieur", key3: "B" },
    { key1: 5, key2: "À l'ouest", key3: "A" },
    { key1: 56.7, key2: "Éléphant", key3: "A" },
    { key1: 900, key2: "Zéphir", key3: "A" },
  ]);

  await sdb.close();
});

test("sort captures mutable arguments when queued", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("capturedSort");
  const order: { value: "asc" | "desc" } = { value: "asc" };
  const lang: Record<string, string> = {};
  const options = { lang };

  table.loadArray([{ value: 2 }, { value: 1 }]).sort(order, options);
  order.value = "desc";
  lang.value = "fr";

  expect(await table.getData()).toStrictEqual([{ value: 1 }, { value: 2 }]);
  expect(options).toStrictEqual({ lang: { value: "fr" } });
  await sdb.close();
});

test("order-preserving fused methods retain an earlier sort", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sortBeforeTransforms");

  const result = await table
    .loadArray([
      { name: " c ", value: 3 },
      { name: " a ", value: 1 },
      { name: " b ", value: 2 },
    ])
    .sort({ value: "desc" })
    .trim("name")
    .filter("value > 1")
    .selectColumns(["name", "value"])
    .getData();

  expect(result).toStrictEqual([
    { name: "c", value: 3 },
    { name: "b", value: 2 },
  ]);
  await sdb.close();
});

test("grouped results can be sorted deterministically afterward", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sortedGroups");

  table
    .loadArray([
      { group: "b", value: 2 },
      { group: "a", value: 3 },
      { group: "b", value: 4 },
    ])
    .summarize({ columns: "value", by: "group", stats: "sum" })
    .sort({ group: "asc" });

  expect(await table.getData()).toStrictEqual([
    { group: "a", sum: 3 },
    { group: "b", sum: 6 },
  ]);
  await sdb.close();
});

test("aggregated results can be sorted deterministically afterward", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sortedAggregates");

  table
    .loadArray([
      { x: 1, y: 10 },
      { x: 2, y: 20 },
    ])
    .summarize({ columns: ["x", "y"], stats: "sum" })
    .sort({ column: "desc" });

  expect(await table.getData()).toStrictEqual([
    { column: "y", sum: 30 },
    { column: "x", sum: 3 },
  ]);
  await sdb.close();
});

test("sampled results can be sorted deterministically afterward", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sortedSample");

  table
    .loadArray([1, 2, 3, 4, 5, 6].map((value) => ({ value })))
    .sample(4, { seed: 7 })
    .sort({ value: "asc" });

  const values = (await table.getData()).map((row) => row.value as number);
  expect(values).toStrictEqual([...values].sort((a, b) => a - b));
  await sdb.close();
});
