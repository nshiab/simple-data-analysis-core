import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the number of data points", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  assertEquals(await table.getNbValues(), 8);
  await sdb.done();
});
