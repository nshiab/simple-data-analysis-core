import SimpleDB from "../../../src/class/SimpleDB.ts";
import { assertEquals } from "@std/assert";

Deno.test("should return tables and views", async () => {
  const sdb = new SimpleDB();
  await sdb.customQuery(
    `CREATE TABLE "physicalTable" (value INTEGER);
     CREATE VIEW "derivedView" AS SELECT value FROM "physicalTable"`,
  );

  assertEquals(await sdb.getTableNames(), ["derivedView", "physicalTable"]);

  await sdb.close();
});
