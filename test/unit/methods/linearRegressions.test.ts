import { assert, assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should explain when only one numeric column is available", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([{ value: 1, category: "A" }]);

  const error = await assertRejects(() => table.linearRegressions().run());
  assert(error instanceof Error);
  assertEquals(
    error.message,
    `linearRegressions() requires at least 2 numeric columns in table "data", but found 1: "value". Convert at least 1 more column to a numeric type first.`,
  );

  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for all permutations of numeric columns and overwrite the current table with the results", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataCorrelations.json");
  table.linearRegressions({ decimals: 10 });
  table.sort({ r2: "desc", x: "asc" });
  const data = await table.getData();

  assertEquals(data, [
    {
      x: "key3",
      y: "key4",
      slope: -0.5817374127,
      yIntercept: 9.0772682875,
      r2: 0.511428109,
    },
    {
      x: "key4",
      y: "key3",
      slope: -0.8791391061,
      yIntercept: 11.6144357542,
      r2: 0.511428109,
    },
    {
      x: "key2",
      y: "key3",
      slope: 0.172008042,
      yIntercept: 5.8904526224,
      r2: 0.1251237909,
    },
    {
      x: "key3",
      y: "key2",
      slope: 0.7274298892,
      yIntercept: 3.5889945836,
      r2: 0.1251237909,
    },
    {
      x: "key2",
      y: "key4",
      slope: -0.0979020979,
      yIntercept: 5.6311188811,
      r2: 0.0612571786,
    },
    {
      x: "key4",
      y: "key2",
      slope: -0.625698324,
      yIntercept: 11.9720670391,
      r2: 0.0612571786,
    },
  ]);

  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for all permutations of numeric columns and overwrite the current table with the results, with 2 decimals", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataCorrelations.json");
  table.linearRegressions({ decimals: 2 });
  table.sort({ r2: "desc", x: "asc" });
  const data = await table.getData();

  assertEquals(data, [
    { x: "key3", y: "key4", slope: -0.58, yIntercept: 9.08, r2: 0.51 },
    { x: "key4", y: "key3", slope: -0.88, yIntercept: 11.61, r2: 0.51 },
    { x: "key2", y: "key3", slope: 0.17, yIntercept: 5.89, r2: 0.13 },
    { x: "key3", y: "key2", slope: 0.73, yIntercept: 3.59, r2: 0.13 },
    { x: "key2", y: "key4", slope: -0.1, yIntercept: 5.63, r2: 0.06 },
    { x: "key4", y: "key2", slope: -0.63, yIntercept: 11.97, r2: 0.06 },
  ]);

  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for all permutations of numeric columns and push the results to a new table, with 2 decimals", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataCorrelations.json");
  const regre = table.linearRegressions({
    decimals: 2,
    outputTable: true,
  });
  regre.sort({ r2: "desc", x: "asc" });
  const data = await regre.getData();

  assertEquals(data, [
    { x: "key3", y: "key4", slope: -0.58, yIntercept: 9.08, r2: 0.51 },
    { x: "key4", y: "key3", slope: -0.88, yIntercept: 11.61, r2: 0.51 },
    { x: "key2", y: "key3", slope: 0.17, yIntercept: 5.89, r2: 0.13 },
    { x: "key3", y: "key2", slope: 0.73, yIntercept: 3.59, r2: 0.13 },
    { x: "key2", y: "key4", slope: -0.1, yIntercept: 5.63, r2: 0.06 },
    { x: "key4", y: "key2", slope: -0.63, yIntercept: 11.97, r2: 0.06 },
  ]);

  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for all permutations of numeric columns and push the results to a new table with a specific name, with 2 decimals", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataCorrelations.json");
  const regre = table.linearRegressions({
    decimals: 2,
    outputTable: "regr",
  });
  regre.sort({ r2: "desc", x: "asc" });
  const data = await regre.getData();

  assertEquals(data, [
    { x: "key3", y: "key4", slope: -0.58, yIntercept: 9.08, r2: 0.51 },
    { x: "key4", y: "key3", slope: -0.88, yIntercept: 11.61, r2: 0.51 },
    { x: "key2", y: "key3", slope: 0.17, yIntercept: 5.89, r2: 0.13 },
    { x: "key3", y: "key2", slope: 0.73, yIntercept: 3.59, r2: 0.13 },
    { x: "key2", y: "key4", slope: -0.1, yIntercept: 5.63, r2: 0.06 },
    { x: "key4", y: "key2", slope: -0.63, yIntercept: 11.97, r2: 0.06 },
  ]);

  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for specific columns with a specific category", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const temp = sdb.newTable();
  temp.loadData("./test/data/files/dailyTemperatures.csv");
  temp.addColumn("decade", "integer", "FLOOR(YEAR(time)/10)*10");
  temp.summarize({
    values: "t",
    categories: ["decade", "id"],
    summaries: "mean",
  });
  temp.linearRegressions({
    x: "decade",
    y: "mean",
    categories: "id",
    decimals: 2,
  });

  temp.sort({ r2: "desc" });
  const data = await temp.getData();

  assertEquals(data, [
    {
      id: 6158355,
      x: "decade",
      y: "mean",
      slope: 0.02,
      yIntercept: -29.85,
      r2: 0.92,
    },
    {
      id: 1108380,
      x: "decade",
      y: "mean",
      slope: 0.02,
      yIntercept: -24.53,
      r2: 0.9,
    },
    {
      id: 7024745,
      x: "decade",
      y: "mean",
      slope: 0.02,
      yIntercept: -30.57,
      r2: 0.83,
    },
  ]);

  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for all combination of a column x and other numeric columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataCorrelations.json");
  table.linearRegressions({
    x: "key2",
    decimals: 2,
  });
  table.sort({ r2: "desc" });
  const data = await table.getData();

  assertEquals(data, [
    { x: "key2", y: "key3", slope: 0.17, yIntercept: 5.89, r2: 0.13 },
    { x: "key2", y: "key4", slope: -0.1, yIntercept: 5.63, r2: 0.06 },
  ]);

  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for two specific columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataCorrelations.json");
  table.linearRegressions({
    x: "key2",
    y: "key3",
    decimals: 2,
  });
  const data = await table.getData();
  assertEquals(data, [
    { x: "key2", y: "key3", slope: 0.17, yIntercept: 5.89, r2: 0.13 },
  ]);

  await sdb.close();
});

Deno.test("should bind result labels containing apostrophes", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { "x's": 1, y: 3 },
    { "x's": 2, y: 5 },
  ]);
  table.linearRegressions({ x: "x's", y: "y" });

  assertEquals(await table.getData(), [{
    x: "x's",
    y: "y",
    slope: 2,
    yIntercept: 1,
    r2: 1,
  }]);
  await sdb.close();
});

Deno.test("should return the slope, yIntercept and coefficient of determination for two specific columns, with a specific number of decimals", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/dataCorrelations.json");
  table.linearRegressions({
    x: "key2",
    y: "key3",
    decimals: 5,
  });
  const data = await table.getData();
  assertEquals(data, [
    {
      x: "key2",
      y: "key3",
      slope: 0.17201,
      yIntercept: 5.89045,
      r2: 0.12512,
    },
  ]);

  await sdb.close();
});
