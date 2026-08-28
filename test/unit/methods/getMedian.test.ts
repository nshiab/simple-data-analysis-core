import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the median value", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  assertEquals(await table.getMedian("key1"), 2.5);
  await sdb.close();
});

Deno.test("should return the median value rounded", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  assertEquals(
    await table.getMedian("key1", { decimals: 0 }),
    3,
  );
  await sdb.close();
});
Deno.test("should return the median value even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  assertEquals(await table.getMedian("key 1"), 2.5);
  await sdb.close();
});
Deno.test("should return the median value rounded even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  assertEquals(
    await table.getMedian("key 1", { decimals: 0 }),
    3,
  );
  await sdb.close();
});
