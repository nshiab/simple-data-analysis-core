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

test("should round the completed sum to the requested decimal places", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sales");
  table.loadArray([{ "sale amount": 0.264 }, { "sale amount": 0.264 }]);

  expect(await table.getSum("sale amount", { decimals: 2 })).toStrictEqual(0.53);
  expect(await table.getSum("sale amount", { decimals: 0 })).toStrictEqual(1);

  await sdb.close();
});
