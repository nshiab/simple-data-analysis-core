import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the max value", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  assertEquals(await table.getMax("key1"), 4);
  await sdb.close();
});
Deno.test("should return the max value even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key1: "key 1" });
  assertEquals(await table.getMax("key 1"), 4);
  await sdb.close();
});
Deno.test("should return the max value with Dates", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadArray([
    { key1: new Date("2020-01-01") },
    { key1: new Date("2021-01-01") },
    { key1: new Date("2022-01-01") },
    { key1: new Date("2023-01-01") },
  ]);
  assertEquals(await table.getMax("key1"), new Date("2023-01-01"));
  await sdb.close();
});
