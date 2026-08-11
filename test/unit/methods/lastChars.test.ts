import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the last two strings", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { firstName: "Nael", lastName: "Shiab" },
    { firstName: "Graeme", lastName: "Bruce" },
  ]);

  table.lastChars("firstName", 2);

  const data = await table.getData();

  assertEquals(data, [
    { firstName: "el", lastName: "Shiab" },
    { firstName: "me", lastName: "Bruce" },
  ]);

  await sdb.done();
});
