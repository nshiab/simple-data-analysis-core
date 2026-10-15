import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should clean column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  table.cleanColumnNames();
  const columns = await table.getColumns();
  expect(columns).toStrictEqual([
    "name",
    "hireDate",
    "job",
    "salary",
    "departmentOrUnit",
    "endOfYearBonus",
  ]);
  await sdb.close();
});
