import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("should return the name of the table before loading data", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("employees");

  const tableName = table.getName();

  assertEquals(tableName, "employees");
  assertEquals(table.name, "employees");
  assertEquals(
    Object.getOwnPropertyDescriptor(SimpleTable.prototype, "name")?.set,
    undefined,
  );
  await sdb.close();
});
Deno.test("should return the name of the table after loading data", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.csv");
  const tableName = table.getName();

  assertEquals(tableName, "data");
  await table.run();
  await sdb.close();
});
Deno.test("should return the updated name after renaming the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("oldName");
  table.loadData("test/data/files/data.csv");

  await table.renameTable("newName");
  const tableName = table.getName();

  assertEquals(tableName, "newName");
  await sdb.close();
});
