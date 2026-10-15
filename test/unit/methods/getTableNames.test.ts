import { test, expect } from "vite-plus/test";
import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return tables and views", async () => {
  const sdb = new SimpleDB();
  await sdb.customQuery(
    `CREATE TABLE "physicalTable" (value INTEGER);
     CREATE VIEW "derivedView" AS SELECT value FROM "physicalTable"`,
  );

  expect(await sdb.getTableNames()).toStrictEqual(["derivedView", "physicalTable"]);

  await sdb.close();
});
