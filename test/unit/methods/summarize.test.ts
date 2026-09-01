import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should quote statistic aliases and bind column labels", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { "sales'net": 2, cost: 1 },
    { "sales'net": 4, cost: 3 },
  ]);
  const result = table.summarize({
    columns: ["sales'net", "cost"],
    stats: { "average's": "mean" },
    outputTable: true,
  });

  assertEquals(await result.getData(), [
    { column: "cost", "average's": 2 },
    { column: "sales'net", "average's": 3 },
  ]);
  await sdb.close();
});

Deno.test("should summarize all rows (no option columns)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize();
  const data = await table.getData();
  assertEquals(data, [{ count: 6 }]);
  await sdb.close();
});
Deno.test("should summarize all rows into a new table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  const summaryAllRows = table.summarize({
    by: "key1",
    outputTable: "summaryAllRows",
  });
  const data = await summaryAllRows.getData();
  assertEquals(data, [
    { key1: "Banane", count: 2 },
    { key1: "Fraise", count: 2 },
    { key1: "Rubarbe", count: 2 },
  ]);
  await sdb.close();
});
Deno.test("should summarize all rows into a new table, even if column names have spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.renameColumns({
    "key1": "key 1",
    "key2": "key 2",
    "key3": "key 3",
  });

  const summaryAllRows = table.summarize({
    columns: "key 2",
    by: "key 1",
    outputTable: "summaryAllRows",
  });

  const data = await summaryAllRows.getData();
  assertEquals(data, [
    {
      "key 1": "Banane",
      count: 2,
      countDistinct: 0,
      countNull: 2,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      "key 1": "Fraise",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 11,
      max: 22,
      mean: 16.5,
      median: 16.5,
      sum: 33,
      skew: null,
      stdDev: 7.7781745930520225,
      variance: 60.5,
    },
    {
      "key 1": "Rubarbe",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 1,
      max: 2,
      mean: 1.5,
      median: 1.5,
      sum: 3,
      skew: null,
      stdDev: 0.7071067811865476,
      variance: 0.5,
    },
  ]);
  await sdb.close();
});
Deno.test("should summarize all rows into a new table and the original table shouldn't be modified", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  const beforeData = await table.getData();
  table.summarize({
    by: "key1",
    outputTable: "summaryAllRows",
  });
  const afterData = await table.getData();
  assertEquals(beforeData, afterData);
  await sdb.close();
});

Deno.test("should summarize all columns in a table and overwrite the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({ columns: await table.getColumns() });
  const data = await table.getData();

  assertEquals(data, [
    {
      column: "key1",
      count: 6,
      countDistinct: 3,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key2",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9668861556278396,
      stdDev: 9.763879010584539,
      variance: 95.33333333333333,
    },
    {
      column: "key3",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 2.345,
      max: 12.3434,
      mean: 7.438525,
      median: 7.53285,
      sum: 29.7541,
      skew: -0.057065942564767755,
      stdDev: 4.747895967250477,
      variance: 22.542516115833337,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize with 2 decimals all columns in a table and overwrite the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({ columns: await table.getColumns(), decimals: 2 });
  const data = await table.getData();

  assertEquals(data, [
    {
      column: "key1",
      count: 6,
      countDistinct: 3,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key2",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.97,
      stdDev: 9.76,
      variance: 95.33,
    },
    {
      column: "key3",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 2.35,
      max: 12.34,
      mean: 7.44,
      median: 7.53,
      sum: 29.75,
      skew: -0.06,
      stdDev: 4.75,
      variance: 22.54,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize all columns in a table and output the results in another table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  const newTable = table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    outputTable: true,
  });
  const data = await newTable.getData();

  assertEquals(data, [
    {
      column: "key1",
      count: 6,
      countDistinct: 3,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key2",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.97,
      stdDev: 9.76,
      variance: 95.33,
    },
    {
      column: "key3",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 2.35,
      max: 12.34,
      mean: 7.44,
      median: 7.53,
      sum: 29.75,
      skew: -0.06,
      stdDev: 4.75,
      variance: 22.54,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize all columns in a table and output the results in another table with a specific name in the DB", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    outputTable: "newTable",
  });
  const data = await sdb.customQuery("select * from newTable", {
    returnData: true,
  });

  assertEquals(data, [
    {
      column: "key1",
      count: 6,
      countDistinct: 3,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key2",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.97,
      stdDev: 9.76,
      variance: 95.33,
    },
    {
      column: "key3",
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 2.35,
      max: 12.34,
      mean: 7.44,
      median: 7.53,
      sum: 29.75,
      skew: -0.06,
      stdDev: 4.75,
      variance: 22.54,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize specific columns in a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    decimals: 2,
    columns: "key2",
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.97,
      stdDev: 9.76,
      variance: 95.33,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize specific columns in a table with a specific number of decimals", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: "key2",
    decimals: 4,
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      variance: 95.3333,
    },
  ]);
  await sdb.close();
});
Deno.test("should summarize a single column without adding a `column` output column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: "key2",
    decimals: 4,
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      count: 6,
      countDistinct: 4,
      countNull: 2,
      min: 1,
      max: 22,
      mean: 9,
      median: 6.5,
      sum: 36,
      skew: 0.9669,
      stdDev: 9.7639,
      variance: 95.3333,
    },
  ]);
  await sdb.close();
});
Deno.test("should summarize a grouped single column without adding a `column` output column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: "key2",
    by: "key1",
    decimals: 4,
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      key1: "Banane",
      count: 2,
      countDistinct: 0,
      countNull: 2,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      key1: "Fraise",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 11,
      max: 22,
      mean: 16.5,
      median: 16.5,
      sum: 33,
      skew: null,
      stdDev: 7.7782,
      variance: 60.5,
    },
    {
      key1: "Rubarbe",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 1,
      max: 2,
      mean: 1.5,
      median: 1.5,
      sum: 3,
      skew: null,
      stdDev: 0.7071,
      variance: 0.5,
    },
  ]);
  await sdb.close();
});
Deno.test("should not add a `column` output column when summarizing a single column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: "key2",
    stats: ["count", "mean"],
  });
  const columns = await table.getColumns();

  assertEquals(columns, ["count", "mean"]);
  await sdb.close();
});
Deno.test("should add a `column` output column when summarizing multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: ["key2", "key3"],
    stats: ["count", "mean"],
  });
  const columns = await table.getColumns();

  assertEquals(columns, ["column", "count", "mean"]);
  await sdb.close();
});
Deno.test("should deduplicate input columns and omit the `column` output column when one remains", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: ["key2", "key2"],
    stats: ["count", "mean"],
  });
  const data = await table.getData();

  assertEquals(data, [{ count: 6, mean: 9 }]);
  await sdb.close();
});
Deno.test("should count rows when all selected columns are also grouping columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: "key1",
    by: "key1",
  });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "Banane", count: 2 },
    { key1: "Fraise", count: 2 },
    { key1: "Rubarbe", count: 2 },
  ]);
  await sdb.close();
});

Deno.test("should summarize all columns in a table with a non numeric category", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    by: "key1",
  });

  const data = await table.getData();

  assertEquals(data, [
    {
      column: "key2",
      key1: "Banane",
      count: 2,
      countDistinct: 0,
      countNull: 2,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key2",
      key1: "Fraise",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 11,
      max: 22,
      mean: 16.5,
      median: 16.5,
      sum: 33,
      skew: null,
      stdDev: 7.78,
      variance: 60.5,
    },
    {
      column: "key2",
      key1: "Rubarbe",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 1,
      max: 2,
      mean: 1.5,
      median: 1.5,
      sum: 3,
      skew: null,
      stdDev: 0.71,
      variance: 0.5,
    },
    {
      column: "key3",
      key1: "Banane",
      count: 2,
      countDistinct: 0,
      countNull: 2,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key3",
      key1: "Fraise",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 2.35,
      max: 12.34,
      mean: 7.34,
      median: 7.34,
      sum: 14.69,
      skew: null,
      stdDev: 7.07,
      variance: 49.98,
    },
    {
      column: "key3",
      key1: "Rubarbe",
      count: 2,
      countDistinct: 2,
      countNull: 0,
      min: 4.57,
      max: 10.5,
      mean: 7.53,
      median: 7.53,
      sum: 15.07,
      skew: null,
      stdDev: 4.2,
      variance: 17.61,
    },
  ]);
  await sdb.close();
});
Deno.test("should summarize all columns in a table with a numeric category", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    by: "key2",
  });
  const data = await table.getData();

  assertEquals(data, [
    {
      column: "key1",
      key2: 1,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key1",
      key2: 2,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key1",
      key2: 11,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key1",
      key2: 22,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key1",
      key2: null,
      count: 2,
      countDistinct: 1,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key3",
      key2: 1,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: 10.5,
      max: 10.5,
      mean: 10.5,
      median: 10.5,
      sum: 10.5,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key3",
      key2: 2,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: 4.57,
      max: 4.57,
      mean: 4.57,
      median: 4.57,
      sum: 4.57,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key3",
      key2: 11,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: 2.35,
      max: 2.35,
      mean: 2.35,
      median: 2.35,
      sum: 2.35,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key3",
      key2: 22,
      count: 1,
      countDistinct: 1,
      countNull: 0,
      min: 12.34,
      max: 12.34,
      mean: 12.34,
      median: 12.34,
      sum: 12.34,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "key3",
      key2: null,
      count: 2,
      countDistinct: 0,
      countNull: 2,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize all columns in a table with specific stats", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    stats: ["mean", "count"],
  });
  const data = await table.getData();

  assertEquals(data, [
    { column: "key1", mean: null, count: 6 },
    { column: "key2", mean: 9, count: 6 },
    { column: "key3", mean: 7.44, count: 6 },
  ]);
  await sdb.close();
});
Deno.test("should summarize all columns in a table with specific stats in specific new columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    stats: { "average": "mean", "total": "count" },
  });
  const data = await table.getData();

  assertEquals(data, [
    { column: "key1", average: null, total: 6 },
    { column: "key2", average: 9, total: 6 },
    { column: "key3", average: 7.44, total: 6 },
  ]);
  await sdb.close();
});
Deno.test("should summarize all columns in a table with specific stats and grouping", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    by: "key1",
    stats: ["mean", "count"],
  });
  const data = await table.getData();

  assertEquals(data, [
    { column: "key2", key1: "Banane", mean: null, count: 2 },
    { column: "key2", key1: "Fraise", mean: 16.5, count: 2 },
    { column: "key2", key1: "Rubarbe", mean: 1.5, count: 2 },
    { column: "key3", key1: "Banane", mean: null, count: 2 },
    { column: "key3", key1: "Fraise", mean: 7.34, count: 2 },
    { column: "key3", key1: "Rubarbe", mean: 7.53, count: 2 },
  ]);
  await sdb.close();
});
Deno.test("should summarize all columns in a table with specific named stats and grouping", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: await table.getColumns(),
    decimals: 2,
    by: "key1",
    stats: { "average": "mean", "total": "count" },
  });
  const data = await table.getData();

  assertEquals(data, [
    { column: "key2", key1: "Banane", average: null, total: 2 },
    { column: "key2", key1: "Fraise", average: 16.5, total: 2 },
    { column: "key2", key1: "Rubarbe", average: 1.5, total: 2 },
    { column: "key3", key1: "Banane", average: null, total: 2 },
    { column: "key3", key1: "Fraise", average: 7.34, total: 2 },
    { column: "key3", key1: "Rubarbe", average: 7.53, total: 2 },
  ]);
  await sdb.close();
});
Deno.test("should summarize specific columns in a table with specific stats and grouping", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    columns: "key2",
    by: "key1",
    stats: ["mean", "count"],
  });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "Banane", mean: null, count: 2 },
    { key1: "Fraise", mean: 16.5, count: 2 },
    { key1: "Rubarbe", mean: 1.5, count: 2 },
  ]);
  await sdb.close();
});
Deno.test("should summarize by multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataSummarize.json");
  table.summarize({
    decimals: 2,
    columns: "key3",
    by: ["key1", "key2"],
    stats: ["mean", "count"],
  });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "Banane", key2: null, mean: null, count: 2 },
    { key1: "Fraise", key2: 11, mean: 2.35, count: 1 },
    { key1: "Fraise", key2: 22, mean: 12.34, count: 1 },
    { key1: "Rubarbe", key2: 1, mean: 10.5, count: 1 },
    { key1: "Rubarbe", key2: 2, mean: 4.57, count: 1 },
  ]);
  await sdb.close();
});

Deno.test("should summarize with dates", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { keyA: new Date("2023-01-01") },
    { keyA: new Date("2022-01-01") },
    { keyA: new Date("2022-01-01") },
    { keyA: new Date("2021-01-01") },
    { keyA: null },
  ]);

  table.summarize({ columns: "keyA" });
  const data = await table.getData();

  assertEquals(data, [
    {
      count: 5,
      countDistinct: 3,
      countNull: 1,
      min: new Date("2021-01-01"),
      max: new Date("2023-01-01"),
      mean: null,
      median: new Date("2022-01-01"),
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize with dates converted to milliseconds", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { keyA: new Date("2023-01-01") },
    { keyA: new Date("2022-01-01") },
    { keyA: new Date("2022-01-01") },
    { keyA: new Date("2021-01-01") },
    { keyA: null },
  ]);

  table.summarize({ columns: "keyA", datesToMs: true });
  const data = await table.getData();

  assertEquals(data, [
    {
      count: 5,
      countDistinct: 3,
      countNull: 1,
      min: 1609459200000,
      max: 1672531200000,
      mean: 1640995200000,
      median: 1640995200000,
      sum: 6563980800000,
      skew: -1.8441043680151512e-10,
      stdDev: 25749036176.13677,
      variance: 663012864000000000000,
    },
  ]);
  await sdb.close();
});

Deno.test("should summarize even with geometries", async () => {
  const sdb = new SimpleDB();
  const provinces = sdb.newTable();
  provinces.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  provinces.summarize({ columns: await provinces.getColumns() });

  const data = await provinces.getData();

  assertEquals(data, [
    {
      column: "geom",
      count: null,
      countDistinct: null,
      countNull: null,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "nameEnglish",
      count: 13,
      countDistinct: 13,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
    {
      column: "nameFrench",
      count: 13,
      countDistinct: 13,
      countNull: 0,
      min: null,
      max: null,
      mean: null,
      median: null,
      sum: null,
      skew: null,
      stdDev: null,
      variance: null,
    },
  ]);
  await sdb.close();
});
