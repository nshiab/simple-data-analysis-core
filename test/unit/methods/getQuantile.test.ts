import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return a quantile", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  expect(await table.getQuantile("key1", 0.25)).toStrictEqual(1.75);
  await sdb.close();
});

test("should return a quantile rounded", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  expect(
    await table.getQuantile("key1", 0.25, {
      decimals: 1,
    }),
  ).toStrictEqual(1.8);
  await sdb.close();
});
test("should return a quantile even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  expect(await table.getQuantile("key 1", 0.25)).toStrictEqual(1.75);
  await sdb.close();
});
test("should return a quantile rounded even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  expect(
    await table.getQuantile("key 1", 0.25, {
      decimals: 1,
    }),
  ).toStrictEqual(1.8);
  await sdb.close();
});
test("should return the median with a quantile of 0.5", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  expect(await table.getQuantile("key1", 0.5)).toStrictEqual(2.5);
  await sdb.close();
});
