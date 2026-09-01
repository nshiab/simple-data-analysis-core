import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should uppercase strings in one column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ firstName: "nael", lastName: "shiab" }]);

  table.upper("firstName");

  const data = await table.getData();

  assertEquals(data, [{ firstName: "NAEL", lastName: "shiab" }]);
  await sdb.close();
});

Deno.test("should uppercase strings in two columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ firstName: "nael", lastName: "shiab" }]);

  table.upper(["firstName", "lastName"]);

  const data = await table.getData();

  assertEquals(data, [{ firstName: "NAEL", lastName: "SHIAB" }]);
  await sdb.close();
});

Deno.test("should uppercase strings in two columns with column names containing spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ "first Name": "nael", "last Name": "shiab" }]);

  table.upper(["first Name", "last Name"]);

  const data = await table.getData();

  assertEquals(data, [
    { "first Name": "NAEL", "last Name": "SHIAB" },
  ]);
  await sdb.close();
});
