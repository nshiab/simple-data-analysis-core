import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("addNoise should add bounded independent noise to numeric columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("measurements");
  table.loadArray([
    { id: 1, x: 10, y: 20 },
    { id: 2, x: 30, y: null },
    { id: 3, x: 50, y: 60 },
  ]);

  table.addNoise(["x", "y"], 0.25);
  const data = await table.getData() as {
    id: number;
    x: number;
    y: number | null;
  }[];

  const originals = new Map([
    [1, { x: 10, y: 20 }],
    [2, { x: 30, y: null }],
    [3, { x: 50, y: 60 }],
  ]);
  for (const row of data) {
    const original = originals.get(row.id)!;
    assert(Math.abs(row.x - original.x) <= 0.25);
    if (original.y === null) {
      assertEquals(row.y, null);
    } else {
      assert(row.y !== null);
      assert(Math.abs(row.y - original.y) <= 0.25);
    }
  }
  const types = await table.getTypes();
  assertEquals(types.x, "DOUBLE");
  assertEquals(types.y, "DOUBLE");

  await sdb.close();
});

Deno.test("addNoise should evaluate duplicates independently in each column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("measurements");
  table.loadArray([
    { id: "both-a", x: 1, y: 10 },
    { id: "both-b", x: 1, y: 10 },
    { id: "duplicate-x", x: 1, y: 20 },
    { id: "duplicate-y", x: 2, y: 10 },
    { id: "unique", x: 3, y: 30 },
  ]);

  table.addNoise(["x", "y"], 0.01, {
    onlyDuplicates: true,
  });
  const data = await table.getData() as {
    id: string;
    x: number;
    y: number;
  }[];

  const originals = new Map([
    ["both-a", { x: 1, y: 10 }],
    ["both-b", { x: 1, y: 10 }],
    ["duplicate-x", { x: 1, y: 20 }],
    ["duplicate-y", { x: 2, y: 10 }],
    ["unique", { x: 3, y: 30 }],
  ]);
  for (const row of data) {
    const original = originals.get(row.id)!;
    if (row.id === "duplicate-y" || row.id === "unique") {
      assertEquals(row.x, original.x);
    } else {
      assert(row.x !== original.x);
      assert(Math.abs(row.x - original.x) <= 0.01);
    }
    if (row.id === "duplicate-x" || row.id === "unique") {
      assertEquals(row.y, original.y);
    } else {
      assert(row.y !== original.y);
      assert(Math.abs(row.y - original.y) <= 0.01);
    }
  }

  await sdb.close();
});

Deno.test("addNoise should validate call-time arguments", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () => table.addNoise("value", -1),
    Error,
    "addNoise() max must be a finite number greater than or equal to 0.",
  );
  assertThrows(
    () => table.addNoise([], 1),
    Error,
    "addNoise() requires at least one column.",
  );
  assertThrows(
    () => table.addNoise(["value", "value"], 1),
    Error,
    'addNoise() received duplicate column "value".',
  );

  await sdb.close();
});

Deno.test("addNoise should reject non-numeric columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ name: "Ada" }]);

  await assertRejects(
    () => table.addNoise("name", 1).run(),
    Error,
    'addNoise() requires numeric columns, but "name" has type VARCHAR.',
  );

  await sdb.close();
});
