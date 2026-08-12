import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should log a description of the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");

  await table.logDescription();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("should not throw an error when there is no table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  await table.logDescription();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("should log a description of the table containing dates", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const temperatures = sdb.newTable("temperatures");
  temperatures.loadData(
    "test/data/files/dailyTemperatures.csv",
  );
  await temperatures.logDescription();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
