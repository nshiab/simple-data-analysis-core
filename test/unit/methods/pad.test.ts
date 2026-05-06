import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should pad left with space", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { key1: "a" },
    { key1: "b" },
  ]);

  await table.pad("key1", { length: 3, method: "left", character: " " });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "  a" },
    { key1: "  b" },
  ]);

  await sdb.done();
});

Deno.test("should pad right with custom character", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { key1: "a" },
    { key1: "b" },
  ]);

  await table.pad("key1", { length: 3, method: "right", character: "_" });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "a__" },
    { key1: "b__" },
  ]);

  await sdb.done();
});

Deno.test("should pad with a single quote", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { key1: "a" },
    { key1: "b" },
  ]);

  await table.pad("key1", { length: 3, method: "left", character: "'" });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "''a" },
    { key1: "''b" },
  ]);

  await sdb.done();
});
