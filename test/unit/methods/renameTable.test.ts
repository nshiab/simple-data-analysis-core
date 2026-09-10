import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should rename a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/cities.csv"]);
  await table.renameTable("canadianCities");

  const tables = await sdb.getTableNames();

  assertEquals(tables, ["canadianCities"]);
  await sdb.close();
});

Deno.test("rename rejects a case-insensitive collision with an unmaterialized table", async () => {
  const sdb = new SimpleDB();
  try {
    const reserved = sdb.newTable("reservedName");
    const source = sdb.newTable("renameSource").loadArray([{ value: 1 }]);
    await assertRejects(
      () => source.renameTable("RESERVEDNAME"),
      Error,
      "already exists",
    );
    assertEquals(source.name, "renameSource");
    assertEquals(sdb.getTables(), [reserved, source]);
    assertEquals(await source.getData(), [{ value: 1 }]);
    assertEquals(await sdb.getTableNames(), [source.name]);
  } finally {
    await sdb.close();
  }
});
