import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the unique values of a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataDuplicates.csv"]);

  const uniques = await table.getUniques("key1");

  expect(uniques).toStrictEqual(["1", "3", "8", "brioche"]);
  await sdb.close();
});
