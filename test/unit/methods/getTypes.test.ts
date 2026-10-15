import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the types of a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.csv"]);

  const types = await table.getTypes();

  expect(types).toStrictEqual({ key1: "VARCHAR", key2: "VARCHAR" });
  await sdb.close();
});
