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

Deno.test("addNoise should change only duplicated combined values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("coordinates");
  table.loadArray([
    { id: "duplicate-a", latitude: 45, longitude: -73 },
    { id: "duplicate-b", latitude: 45, longitude: -73 },
    { id: "unique-latitude", latitude: 45, longitude: -74 },
    { id: "unique-longitude", latitude: 46, longitude: -73 },
  ]);

  table.addNoise(["latitude", "longitude"], 0.01, {
    onlyDuplicates: true,
  });
  const data = await table.getData() as {
    id: string;
    latitude: number;
    longitude: number;
  }[];

  for (const row of data) {
    if (row.id.startsWith("duplicate")) {
      assert(Math.abs(row.latitude - 45) <= 0.01);
      assert(Math.abs(row.longitude + 73) <= 0.01);
    } else if (row.id === "unique-latitude") {
      assertEquals(row.latitude, 45);
      assertEquals(row.longitude, -74);
    } else {
      assertEquals(row.latitude, 46);
      assertEquals(row.longitude, -73);
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
