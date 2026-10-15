import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should log columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logColumns();

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});
test("should log columns with types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logColumns({ types: true });

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});
