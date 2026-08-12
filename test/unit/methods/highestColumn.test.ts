import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should add the highest column name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: 1, b: 3, c: 2 },
    { id: 2, a: 5, b: 4, c: 6 },
  ]);

  table.highestColumn(["a", "b", "c"], "highest");

  assertEquals(await table.getData(), [
    { id: 1, a: 1, b: 3, c: 2, highest: "b" },
    { id: 2, a: 5, b: 4, c: 6, highest: "c" },
  ]);

  await sdb.close();
});

Deno.test("should keep the first supplied column when ties is first", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ id: 1, a: 10, b: 10, c: 5 }]);

  table.highestColumn(["b", "a", "c"], "winner", { ties: "first" });

  assertEquals(await table.getData(), [
    { id: 1, a: 10, b: 10, c: 5, winner: "b" },
  ]);

  await sdb.close();
});

Deno.test("should produce tidy rows for all tied columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: 10, b: 10, c: 5 },
    { id: 2, a: 1, b: 2, c: 3 },
    { id: 3, a: null, b: null, c: null },
  ]);

  table.highestColumn(["a", "b", "c"], "winner", { ties: "all" });
  table.sort({ id: "asc", winner: "asc" });

  assertEquals(await table.getData(), [
    { id: 1, a: 10, b: 10, c: 5, winner: "a" },
    { id: 1, a: 10, b: 10, c: 5, winner: "b" },
    { id: 2, a: 1, b: 2, c: 3, winner: "c" },
    { id: 3, a: null, b: null, c: null, winner: null },
  ]);

  await sdb.close();
});

Deno.test("should ignore null values when finding an extreme", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: null, b: 2, c: 3 },
    { id: 2, a: 1, b: null, c: 3 },
  ]);

  table.highestColumn(["a", "b", "c"], "largest");

  assertEquals(await table.getData(), [
    { id: 1, a: null, b: 2, c: 3, largest: "c" },
    { id: 2, a: 1, b: null, c: 3, largest: "c" },
  ]);

  await sdb.close();
});

Deno.test("should explain the available tie options in strict mode", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ id: 1, a: 10, b: 10 }]);
  table.highestColumn(["a", "b"], "winner");

  await assertRejects(
    () => table.run(),
    Error,
    'highestColumn() found a tie between columns "a", "b". Use { ties: "first" } to select the first tied column, or { ties: "all" } to produce one row for each tied column.',
  );

  await sdb.close();
});

Deno.test("should support column names that require quoting", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ "a name": 2, 'b"name': 3 }]);

  table.highestColumn(["a name", 'b"name'], "winner");

  assertEquals(await table.getData(), [
    { "a name": 2, 'b"name': 3, winner: 'b"name' },
  ]);

  await sdb.close();
});

Deno.test("should reject invalid columns and options", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ numeric: 1, text: "two", existing: "value" }]);

  assertThrows(
    () => table.highestColumn([], "winner"),
    Error,
    "highestColumn() requires at least one column",
  );
  assertThrows(
    () => table.highestColumn(["numeric", "numeric"], "winner"),
    Error,
    'highestColumn() received duplicate column "numeric"',
  );
  assertThrows(
    () =>
      table.highestColumn(["numeric"], "winner", {
        ties: "invalid" as "strict",
      }),
    Error,
    'options.ties must be "strict", "first", or "all"',
  );

  await assertRejects(
    () => table.highestColumn(["missing"], "winner").run(),
    Error,
    'the column "missing" does not exist',
  );
  await assertRejects(
    () => table.highestColumn(["text"], "winner").run(),
    Error,
    'highestColumn() requires numeric columns, but "text" has type VARCHAR',
  );
  await assertRejects(
    () => table.highestColumn(["numeric"], "existing").run(),
    Error,
    'the column "existing" already exists',
  );

  await sdb.close();
});
