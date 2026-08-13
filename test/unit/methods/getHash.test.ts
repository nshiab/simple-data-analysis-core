import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should hash table contents, schema, and row order", async () => {
  const sdb = new SimpleDB();
  const first = sdb.newTable("hashFirst");
  const identical = sdb.newTable("hashIdentical");
  const reordered = sdb.newTable("hashReordered");
  const integerSchema = sdb.newTable("hashIntegerSchema");
  const bigintSchema = sdb.newTable("hashBigintSchema");

  first.loadArray([{ value: 1 }, { value: 2 }, { value: 2 }]);
  identical.loadArray([{ value: 1 }, { value: 2 }, { value: 2 }]);
  reordered.loadArray([{ value: 2 }, { value: 1 }, { value: 2 }]);
  integerSchema.setTypes({ value: "integer" });
  bigintSchema.setTypes({ value: "bigint" });

  const firstHash = await first.getHash();

  assertMatch(firstHash, /^[a-f0-9]{64}$/);
  assertEquals(await identical.getHash(), firstHash);
  assertNotEquals(await reordered.getHash(), firstHash);
  assertNotEquals(await integerSchema.getHash(), await bigintSchema.getHash());

  identical.loadArray([{ value: 1 }, { value: 3 }, { value: 2 }]);
  assertNotEquals(await identical.getHash(), firstHash);

  await sdb.close();
});

Deno.test("should hash geospatial table contents", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("hashGeometry");
  table.loadGeoData("test/geodata/files/pointsInside.json");

  const hash = await table.getHash();

  assertMatch(hash, /^[a-f0-9]{64}$/);
  assertEquals(await table.getHash(), hash);

  await sdb.close();
});
