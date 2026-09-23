import { assertEquals, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should trim all string columns and preserve other types and nulls", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { name: " Alice ", 'a"b': " Toronto ", count: 3, active: true },
    { name: null, 'a"b': " Montreal ", count: 4, active: false },
  ]);
  const types = await table.getTypes();

  table.trim("all");

  assertEquals(await table.getData(), [
    { name: "Alice", 'a"b': "Toronto", count: 3, active: true },
    { name: null, 'a"b': "Montreal", count: 4, active: false },
  ]);
  assertEquals(await table.getTypes(), types);
  await sdb.close();
});

Deno.test("should trim all string columns with custom characters and sides", async () => {
  const sdb = new SimpleDB();
  for (const side of ["left", "right", "both"] as const) {
    const table = sdb.newTable();
    table.loadArray([{ first: "''a''", second: "''b''", count: 1 }]);
    table.trim("all", { character: "'", side });

    assertEquals(await table.getData(), [{
      first: side === "left" ? "a''" : side === "right" ? "''a" : "a",
      second: side === "left" ? "b''" : side === "right" ? "''b" : "b",
      count: 1,
    }]);
  }
  await sdb.close();
});

Deno.test("should resolve all trim columns after preceding queued changes", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ value: " 12 ", label: " old " }])
    .convert({ value: "integer" })
    .renameColumns({ label: "renamed" })
    .addColumn("newText", "string", "' new '")
    .trim("all")
    .replace("newText", { new: "updated" });

  assertEquals(await table.getData(), [{
    value: 12,
    renamed: "old",
    newText: "updated",
  }]);
  await sdb.close();
});

Deno.test("should leave tables without string columns unchanged when trimming all", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ count: 1, active: true }])
    .trim("all")
    .trim("all", { character: "'", side: "right" });

  assertEquals(await table.getData(), [{ count: 1, active: true }]);
  await sdb.close();
});

Deno.test("should trim a literal all column using an array", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ all: " selected ", other: " unchanged " }])
    .trim(["all"]);

  assertEquals(await table.getData(), [{
    all: "selected",
    other: " unchanged ",
  }]);
  await sdb.close();
});

Deno.test("should report valid trim sides", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () =>
      table.trim("value", {
        side: "middle" as "left",
      }),
    Error,
    `trim() options.side must be "left", "right", or "both". Received "middle".`,
  );

  await sdb.close();
});

Deno.test("should remove whitespace", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataTrim.json"]);

  table.trim("key1");
  const data = await table.getData();

  assertEquals(data, [
    { key1: "a", key2: " !@a!@" },
    { key1: "b", key2: " !@b!@" },
    { key1: "c", key2: " !@c!@" },
    { key1: "d", key2: " !@d!@" },
  ]);

  await sdb.close();
});

Deno.test("should remove whitespace with column name containing spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataTrim.json"]);
  table.renameColumns({ key1: "key 1" });

  table.trim("key 1");
  const data = await table.getData();

  assertEquals(data, [
    { "key 1": "a", key2: " !@a!@" },
    { "key 1": "b", key2: " !@b!@" },
    { "key 1": "c", key2: " !@c!@" },
    { "key 1": "d", key2: " !@d!@" },
  ]);

  await sdb.close();
});

Deno.test("should remove whitespace from multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataTrim.json"]);

  table.trim(["key1", "key2"]);

  const data = await table.getData();

  assertEquals(data, [
    { key1: "a", key2: "!@a!@" },
    { key1: "b", key2: "!@b!@" },
    { key1: "c", key2: "!@c!@" },
    { key1: "d", key2: "!@d!@" },
  ]);

  await sdb.close();
});

Deno.test("should remove whitespace just on the left", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataTrim.json"]);

  table.trim("key1", {
    side: "left",
  });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "a  ", key2: " !@a!@" },
    { key1: "b  ", key2: " !@b!@" },
    { key1: "c  ", key2: " !@c!@" },
    { key1: "d  ", key2: " !@d!@" },
  ]);

  await sdb.close();
});

Deno.test("should remove whitespace just on the right", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataTrim.json"]);

  table.trim("key1", {
    side: "right",
  });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "  a", key2: " !@a!@" },
    { key1: "  b", key2: " !@b!@" },
    { key1: "  c", key2: " !@c!@" },
    { key1: "  d", key2: " !@d!@" },
  ]);

  await sdb.close();
});

Deno.test("should remove specific characters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/dataTrim.json"]);

  table.trim("key2", {
    side: "right",
    character: "!@",
  });
  const data = await table.getData();

  assertEquals(data, [
    { key1: "  a  ", key2: " !@a" },
    { key1: "  b  ", key2: " !@b" },
    { key1: "  c  ", key2: " !@c" },
    { key1: "  d  ", key2: " !@d" },
  ]);

  await sdb.close();
});

Deno.test("should bind trim characters containing an apostrophe", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("boundTrim");

  table.loadArray([{ value: "''quoted''" }]);
  table.trim("value", { character: "'" });

  assertEquals(await table.getData(), [{ value: "quoted" }]);
  await sdb.close();
});
