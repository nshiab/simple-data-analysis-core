import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should replace null values in one column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { keyA: 1 },
    { keyA: null },
    { keyA: 3 },
    { keyA: null },
  ]);
  await table.replaceNulls("keyA", 0);

  const data = await table.getData();

  assertEquals(data, [
    { keyA: 1 },
    { keyA: 0 },
    { keyA: 3 },
    { keyA: 0 },
  ]);

  await sdb.done();
});

Deno.test("should replace null values in multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { keyA: 1, keyB: 1 },
    { keyA: null, keyB: 2 },
    { keyA: 3, keyB: null },
    { keyA: null, keyB: 4 },
  ]);
  await table.replaceNulls(["keyA", "keyB"], 0);

  const data = await table.getData();

  assertEquals(data, [
    { keyA: 1, keyB: 1 },
    { keyA: 0, keyB: 2 },
    { keyA: 3, keyB: 0 },
    { keyA: 0, keyB: 4 },
  ]);

  await sdb.done();
});

Deno.test("should replace null values in all columns with the 'all' option", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { keyA: 1, keyB: 1, keyC: 1 },
    { keyA: null, keyB: 2, keyC: null },
    { keyA: 3, keyB: null, keyC: 3 },
    { keyA: null, keyB: 4, keyC: null },
  ]);
  await table.replaceNulls("all", 0);

  const data = await table.getData();

  assertEquals(data, [
    { keyA: 1, keyB: 1, keyC: 1 },
    { keyA: 0, keyB: 2, keyC: 0 },
    { keyA: 3, keyB: 0, keyC: 3 },
    { keyA: 0, keyB: 4, keyC: 0 },
  ]);

  await sdb.done();
});
