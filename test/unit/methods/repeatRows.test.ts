import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should repeat rows based on a specific column values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: 1, count: 2, category: "A" },
    { id: 2, count: 3, category: "B" },
    { id: 3, count: 0, category: "C" },
    { id: 4, count: -1, category: "D" },
    { id: 5, count: null, category: "E" },
  ]);
  await table.repeatRows("count");

  const data = await table.getData();

  assertEquals(data, [
    { id: 1, count: 2, category: "A" },
    { id: 1, count: 2, category: "A" },
    { id: 2, count: 3, category: "B" },
    { id: 2, count: 3, category: "B" },
    { id: 2, count: 3, category: "B" },
  ]);

  await sdb.done();
});

Deno.test("should repeat rows based on a specific column values and add an index column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: 1, count: 2, category: "A" },
    { id: 2, count: 3, category: "B" },
  ]);
  await table.repeatRows("count", { index: "copyId" });

  const data = await table.getData();

  assertEquals(data, [
    { id: 1, count: 2, category: "A", copyId: 0 },
    { id: 1, count: 2, category: "A", copyId: 1 },
    { id: 2, count: 3, category: "B", copyId: 0 },
    { id: 2, count: 3, category: "B", copyId: 1 },
    { id: 2, count: 3, category: "B", copyId: 2 },
  ]);

  await sdb.done();
});
