import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the total number of characters", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  // key2 values: "un" (2), "deux" (4), "trois" (5), "quatre" (6)
  // Total: 2 + 4 + 5 + 6 = 17
  assertEquals(await table.getCharacterCount("key2"), 17);
  await sdb.close();
});

Deno.test("should return the total number of characters even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key2: "key 2" });
  // key2 values: "un" (2), "deux" (4), "trois" (5), "quatre" (6)
  // Total: 2 + 4 + 5 + 6 = 17
  assertEquals(await table.getCharacterCount("key 2"), 17);
  await sdb.close();
});
