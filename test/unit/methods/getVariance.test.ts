import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the variance", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  expect(await table.getVariance("key1")).toStrictEqual(1.6666666666666667);
  await sdb.close();
});
test("should return the variance rounded", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  expect(await table.getVariance("key1", { decimals: 6 })).toStrictEqual(1.666667);
  await sdb.close();
});
test("should return the variance even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key1: "key 1" });
  expect(await table.getVariance("key 1")).toStrictEqual(1.6666666666666667);
  await sdb.close();
});
test("should return the variance rounded even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key1: "key 1" });
  expect(await table.getVariance("key 1", { decimals: 6 })).toStrictEqual(1.666667);
  await sdb.close();
});
