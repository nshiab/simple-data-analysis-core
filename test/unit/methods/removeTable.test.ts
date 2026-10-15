import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should remove a table and log no tables", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/cities.csv"]);
  await table.removeTable();
  const tables = await sdb.getTableNames();

  expect(tables).toStrictEqual([]);
  await sdb.close();
});
test("should remove a table and show no tables in sdb", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/cities.csv"]);
  await table.removeTable();

  expect(sdb.getTables()).toStrictEqual([]);
  await sdb.close();
});
test("should remove a table and let create the same new table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/cities.csv"]);
  await table.removeTable();

  const table2 = sdb.newTable("data");
  table2.loadData(["test/data/files/cities.csv"]);

  const tables = await sdb.getTableNames();

  expect(tables).toStrictEqual(["data"]);
  expect(sdb.getTables().map((d) => d.name)).toStrictEqual(["data"]);
  await sdb.close();
});
