import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the first row", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  const data = await table.getFirstRow();
  expect(data).toStrictEqual({ key1: 1, key2: "un" });
  await sdb.close();
});

test("should return the first row found based on a condition", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  const data = await table.getFirstRow({
    conditions: `key2 = 'trois'`,
  });
  expect(data).toStrictEqual({
    key1: 3,
    key2: "trois",
  });
  await sdb.close();
});

test("should return null when no row matches the condition", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  const data = await table.getFirstRow({
    conditions: `key2 = 'nope'`,
  });
  expect(data).toStrictEqual(null);
  await sdb.close();
});
