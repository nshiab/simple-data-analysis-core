import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the first two strings", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { firstName: "Nael", lastName: "Shiab" },
    { firstName: "Graeme", lastName: "Bruce" },
  ]);

  table.firstChars("firstName", 2);

  const data = await table.getData();

  assertEquals(data, [
    { firstName: "Na", lastName: "Shiab" },
    { firstName: "Gr", lastName: "Bruce" },
  ]);

  await sdb.done();
});
