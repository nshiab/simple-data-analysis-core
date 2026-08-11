import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the first row", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  const data = await table.getFirstRow();
  assertEquals(data, { key1: 1, key2: "un" });
  await sdb.done();
});

Deno.test("should return the first row found based on a condition", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  const data = await table.getFirstRow({
    conditions: `key2 = 'trois'`,
  });
  assertEquals(data, {
    key1: 3,
    key2: "trois",
  });
  await sdb.done();
});

Deno.test("should return null when no row matches the condition", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  const data = await table.getFirstRow({
    conditions: `key2 = 'nope'`,
  });
  assertEquals(data, null);
  await sdb.done();
});
