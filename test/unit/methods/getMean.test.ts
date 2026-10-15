import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the mean value", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  expect(await table.getMean("key1")).toStrictEqual(2.5);
  await sdb.close();
});

test("should return the mean value rounded", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  expect(await table.getMean("key1", { decimals: 0 })).toStrictEqual(3);
  await sdb.close();
});
test("should return the mean value even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  expect(await table.getMean("key 1")).toStrictEqual(2.5);
  await sdb.close();
});

test("should return the mean value rounded even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  expect(await table.getMean("key 1", { decimals: 0 })).toStrictEqual(3);
  await sdb.close();
});
