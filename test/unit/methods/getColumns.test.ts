import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the columns of a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.csv");

  const columns = await table.getColumns();

  expect(columns).toStrictEqual(["key1", "key2"]);
  await sdb.close();
});
