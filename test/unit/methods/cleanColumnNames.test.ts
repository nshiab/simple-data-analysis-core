import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should clean column names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  table.cleanColumnNames();
  const columns = await table.getColumns();
  assertEquals(columns, [
    "name",
    "hireDate",
    "job",
    "salary",
    "departmentOrUnit",
    "endOfYearBonus",
  ]);
  await sdb.done();
});
