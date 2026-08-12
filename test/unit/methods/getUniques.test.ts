import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the unique values of a column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/dataDuplicates.csv"]);

  const uniques = await table.getUniques("key1");

  assertEquals(uniques, ["1", "3", "8", "brioche"]);
  await sdb.close();
});
