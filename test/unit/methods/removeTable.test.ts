import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should remove a table and log no tables", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/cities.csv"]);
  await table.removeTable();
  const tables = await sdb.getTableNames();

  assertEquals(tables, []);
  await sdb.close();
});
Deno.test("should remove a table and show no tables in sdb", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/cities.csv"]);
  await table.removeTable();

  assertEquals(sdb.getTables(), []);
  await sdb.close();
});
Deno.test("should remove a table and let create the same new table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/cities.csv"]);
  await table.removeTable();

  const table2 = sdb.newTable("data");
  table2.loadData(["test/data/files/cities.csv"]);

  const tables = await sdb.getTableNames();

  assertEquals(tables, ["data"]);
  assertEquals(sdb.getTables().map((d) => d.name), ["data"]);
  await sdb.close();
});
