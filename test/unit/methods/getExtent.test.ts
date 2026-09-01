import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the extent in [min, max] order", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  assertEquals(await table.getExtent("key1"), [1, 4]);
  await sdb.close();
});
