import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should log the number of rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.logRowCount();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
