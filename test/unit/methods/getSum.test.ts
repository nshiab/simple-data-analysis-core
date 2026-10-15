import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the sum", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  expect(await table.getSum("key1")).toStrictEqual(10);
  await sdb.close();
});
test("should return the sum even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key1: "key 1" });
  expect(await table.getSum("key 1")).toStrictEqual(10);
  await sdb.close();
});
