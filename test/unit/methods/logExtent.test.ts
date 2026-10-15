import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should log the extent", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  table.convert({ Salary: "number" }, { strict: false });
  await table.logExtent("Salary");

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});
