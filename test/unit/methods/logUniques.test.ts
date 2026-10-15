import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should log unique values in a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logUniques("Name");

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});

test("should log stringified unique values in a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logUniques("Name", { stringify: true });

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});
