import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should left-pad strings to target length with default zero", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: "1" },
    { id: "23" },
    { id: "456" },
  ]);

  await table.pad("id", 3);

  const data = await table.getData();

  assertEquals(data, [
    { id: "001" },
    { id: "023" },
    { id: "456" },
  ]);
  await sdb.done();
});

Deno.test("should right-pad strings to target length", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { code: "123" },
    { code: "45" },
    { code: "6" },
  ]);

  await table.pad("code", 5, { side: "end" });

  const data = await table.getData();

  assertEquals(data, [
    { code: "12300" },
    { code: "45000" },
    { code: "60000" },
  ]);
  await sdb.done();
});

Deno.test("should left-pad with custom character", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: "1" },
    { id: "2" },
  ]);

  await table.pad("id", 4, { side: "start", char: "-" });

  const data = await table.getData();

  assertEquals(data, [
    { id: "---1" },
    { id: "---2" },
  ]);
  await sdb.done();
});

Deno.test("should right-pad with custom character", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { code: "AB" },
    { code: "CD" },
  ]);

  await table.pad("code", 5, { side: "end", char: "*" });

  const data = await table.getData();

  assertEquals(data, [
    { code: "AB***" },
    { code: "CD***" },
  ]);
  await sdb.done();
});

Deno.test("should handle null values by leaving them as null", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: "1" },
    { id: null },
    { id: "3" },
  ]);

  await table.pad("id", 3);

  const data = await table.getData();

  assertEquals(data, [
    { id: "001" },
    { id: null },
    { id: "003" },
  ]);
  await sdb.done();
});

Deno.test("should throw error when column is not string type", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: 1 },
    { id: 2 },
  ]);

  await assertRejects(
    () => table.pad("id", 5),
    Error,
    'The column "id" is of type DOUBLE',
  );
  await sdb.done();
});

Deno.test("should throw error when string exceeds target length", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { name: "Hello" },
    { name: "World!!" },
    { name: "Short" },
  ]);

  await assertRejects(
    () => table.pad("name", 5),
    Error,
    'The string "World!!" in column "name" has length 7, which exceeds the target length 5.',
  );
  await sdb.done();
});

Deno.test("should handle column names with spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { "user id": "1" },
    { "user id": "23" },
  ]);

  await table.pad("user id", 4);

  const data = await table.getData();

  assertEquals(data, [
    { "user id": "0001" },
    { "user id": "0023" },
  ]);
  await sdb.done();
});

Deno.test("should handle empty strings", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: "" },
    { id: "a" },
  ]);

  await table.pad("id", 3);

  const data = await table.getData();

  assertEquals(data, [
    { id: "000" },
    { id: "00a" },
  ]);
  await sdb.done();
});

Deno.test("should throw error when string exceeds target length 0", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { text: "Hello" },
    { text: "World" },
  ]);

  await assertRejects(
    () => table.pad("text", 0),
    Error,
    'The string "Hello" in column "text" has length 5, which exceeds the target length 0.',
  );
  await sdb.done();
});

Deno.test("should handle padding with multi-character fill string", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: "1" },
  ]);

  await table.pad("id", 5, { side: "start", char: "ab" });

  const data = await table.getData();

  assertEquals(data, [
    { id: "abab1" },
  ]);
  await sdb.done();
});

Deno.test("should pad with default side being start", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { code: "ABC" },
  ]);

  await table.pad("code", 6);

  const data = await table.getData();

  assertEquals(data, [
    { code: "000ABC" },
  ]);
  await sdb.done();
});

Deno.test("should pad with default char being zero", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { value: "123" },
  ]);

  await table.pad("value", 5, { side: "end" });

  const data = await table.getData();

  assertEquals(data, [
    { value: "12300" },
  ]);
  await sdb.done();
});

Deno.test("should handle multiple rows with null values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { id: "1" },
    { id: null },
    { id: "23" },
    { id: null },
    { id: "45" },
  ]);

  await table.pad("id", 4, { side: "start", char: "0" });

  const data = await table.getData();

  assertEquals(data, [
    { id: "0001" },
    { id: null },
    { id: "0023" },
    { id: null },
    { id: "0045" },
  ]);
  await sdb.done();
});
