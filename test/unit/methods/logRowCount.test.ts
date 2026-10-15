import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should log the number of rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logRowCount();

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});
