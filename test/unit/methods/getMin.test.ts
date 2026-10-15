import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the min value", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  expect(await table.getMin("key1")).toStrictEqual(1);
  await sdb.close();
});
test("should return the min value even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  expect(await table.getMin("key 1")).toStrictEqual(1);
  await sdb.close();
});
test("should return the min value with Dates", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { key1: new Date("2020-01-01") },
    { key1: new Date("2021-01-01") },
    { key1: new Date("2022-01-01") },
    { key1: new Date("2023-01-01") },
  ]);
  expect(await table.getMin("key1")).toStrictEqual(new Date("2020-01-01"));
  await sdb.close();
});
