import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the skew", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataJustNumbers.csv"]);
  expect(await table.getSkew("key1")).toStrictEqual(1.6460497551716866);
  await sdb.close();
});

test("should return the skew rounded", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataJustNumbers.csv"]);
  expect(await table.getSkew("key1", { decimals: 2 })).toStrictEqual(1.65);
  await sdb.close();
});
test("should return the skew even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataJustNumbers.csv"]);
  table.renameColumns({ key1: "key 1" });
  expect(await table.getSkew("key 1")).toStrictEqual(1.6460497551716866);
  await sdb.close();
});
test("should return the skew rounded even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataJustNumbers.csv"]);
  table.renameColumns({ key1: "key 1" });
  expect(await table.getSkew("key 1", { decimals: 2 })).toStrictEqual(1.65);
  await sdb.close();
});
