import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should lowercase strings in one column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ firstName: "NAEL", lastName: "SHIAB" }]);

  table.lower("firstName");

  const data = await table.getData();

  assertEquals(data, [{ firstName: "nael", lastName: "SHIAB" }]);
  await sdb.close();
});

Deno.test("should lowercase strings in two columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ firstName: "NAEL", lastName: "SHIAB" }]);

  table.lower(["firstName", "lastName"]);

  const data = await table.getData();

  assertEquals(data, [{ firstName: "nael", lastName: "shiab" }]);
  await sdb.close();
});

Deno.test("should lowercase strings in two columns with column names containing spaces", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ "first Name": "NAEL", "last Name": "SHIAB" }]);

  table.lower(["first Name", "last Name"]);

  const data = await table.getData();

  assertEquals(data, [
    { "first Name": "nael", "last Name": "shiab" },
  ]);
  await sdb.close();
});
