import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return true when the column is in the data", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.csv");
  const boolean = await table.hasColumn("key1");
  expect(boolean).toStrictEqual(true);
  await sdb.close();
});

test("should return false when the column is not in the data", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.csv");
  const boolean = await table.hasColumn("keyX");
  expect(boolean).toStrictEqual(false);
  await sdb.close();
});
