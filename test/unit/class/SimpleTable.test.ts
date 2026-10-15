import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

test("should create a new SimpleTable", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  expect(table instanceof SimpleTable).toStrictEqual(true);
  await sdb.close();
});
