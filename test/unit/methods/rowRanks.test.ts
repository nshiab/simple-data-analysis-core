import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should add the highest column name and value by default", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: 1, b: 3, c: 2 },
    { id: 2, a: 5, b: 4, c: 6 },
  ]);

  table.rowRanks(["a", "b", "c"], {
    nameColumn: "highest",
    valueColumn: "highestValue",
  });

  assertEquals(await table.getData(), [
    { id: 1, a: 1, b: 3, c: 2, highest: "b", highestValue: 3 },
    { id: 2, a: 5, b: 4, c: 6, highest: "c", highestValue: 6 },
  ]);

  await sdb.close();
});

Deno.test("should select an ascending row rank", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: 1, b: 3, c: 2 },
    { id: 2, a: 5, b: 4, c: 6 },
  ]);

  table.rowRanks(["a", "b", "c"], {
    nameColumn: "secondLowest",
    valueColumn: "secondLowestValue",
    rank: 2,
    order: "asc",
  });

  assertEquals(await table.getData(), [
    { id: 1, a: 1, b: 3, c: 2, secondLowest: "c", secondLowestValue: 2 },
    { id: 2, a: 5, b: 4, c: 6, secondLowest: "a", secondLowestValue: 5 },
  ]);

  await sdb.close();
});

Deno.test("should resolve ties by supplied column order without adding rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ id: 1, a: 10, b: 10, c: 5 }]);

  table.rowRanks(["b", "a", "c"], {
    nameColumn: "first",
    valueColumn: "firstValue",
  });
  table.rowRanks(["b", "a", "c"], {
    nameColumn: "second",
    valueColumn: "secondValue",
    rank: 2,
  });

  assertEquals(await table.getData(), [{
    id: 1,
    a: 10,
    b: 10,
    c: 5,
    first: "b",
    firstValue: 10,
    second: "a",
    secondValue: 10,
  }]);

  await sdb.close();
});

Deno.test("should ignore null values and return null when a rank is absent", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    { id: 1, a: null, b: 2, c: 3 },
    { id: 2, a: null, b: null, c: null },
    { id: 3, a: 1, b: null, c: null },
  ]);

  table.rowRanks(["a", "b", "c"], {
    nameColumn: "third",
    valueColumn: "thirdValue",
    rank: 3,
  });

  assertEquals(await table.getData(), [
    { id: 1, a: null, b: 2, c: 3, third: null, thirdValue: null },
    { id: 2, a: null, b: null, c: null, third: null, thirdValue: null },
    { id: 3, a: 1, b: null, c: null, third: null, thirdValue: null },
  ]);

  await sdb.close();
});

Deno.test("should support name-only, value-only, and quoted output columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ "a name": 2, 'b"name': 3 }]);

  table.rowRanks(["a name", 'b"name'], { nameColumn: "winner name" });
  table.rowRanks(["a name", 'b"name'], { valueColumn: 'winner "value"' });

  assertEquals(await table.getData(), [{
    "a name": 2,
    'b"name': 3,
    "winner name": 'b"name',
    'winner "value"': 3,
  }]);

  await sdb.close();
});

Deno.test("should reject invalid row rank arguments", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([{ numeric: 1, text: "two", existing: "value" }]);

  assertThrows(
    () => table.rowRanks([], { nameColumn: "winner" }),
    Error,
    "rowRanks() requires at least one column",
  );
  assertThrows(
    () => table.rowRanks(["numeric", "numeric"], { nameColumn: "winner" }),
    Error,
    'rowRanks() received duplicate column "numeric"',
  );
  assertThrows(
    () =>
      // @ts-expect-error rowRanks() requires at least one output column.
      table.rowRanks(["numeric"], {}),
    Error,
    "rowRanks() requires nameColumn, valueColumn, or both",
  );
  assertThrows(
    () =>
      table.rowRanks(["numeric"], {
        nameColumn: "result",
        valueColumn: "result",
      }),
    Error,
    'rowRanks() cannot use "result" for both output columns',
  );
  assertThrows(
    () => table.rowRanks(["numeric"], { nameColumn: "winner", rank: 0 }),
    Error,
    "rowRanks() options.rank must be a positive integer",
  );
  assertThrows(
    () =>
      table.rowRanks(["numeric"], {
        nameColumn: "winner",
        order: "invalid" as "asc",
      }),
    Error,
    'rowRanks() options.order must be "asc" or "desc"',
  );

  await sdb.close();
});

Deno.test("should reject invalid row rank columns when the operation runs", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  const missingTable = sdb.newTable();
  missingTable.loadArray([{ numeric: 1 }]);
  await assertRejects(
    () => missingTable.rowRanks(["missing"], { nameColumn: "winner" }).run(),
    Error,
    'the column "missing" does not exist',
  );

  const textTable = sdb.newTable();
  textTable.loadArray([{ text: "one" }]);
  await assertRejects(
    () => textTable.rowRanks(["text"], { nameColumn: "winner" }).run(),
    Error,
    'rowRanks() requires numeric columns, but "text" has type VARCHAR',
  );

  const collisionTable = sdb.newTable();
  collisionTable.loadArray([{ numeric: 1, existing: "value" }]);
  await assertRejects(
    () =>
      collisionTable.rowRanks(["numeric"], { nameColumn: "existing" }).run(),
    Error,
    'the column "existing" already exists',
  );

  await sdb.close();
});
