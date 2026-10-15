import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the number of columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/employees.json"]);
  expect(await table.getColumnCount()).toStrictEqual(6);
  await sdb.close();
});
