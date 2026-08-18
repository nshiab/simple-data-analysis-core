import { assertEquals, assertMatch, assertNotEquals } from "@std/assert";
import crypto from "node:crypto";
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

  const summary = (await sdb.customQuery(
    `WITH numbered AS (
      SELECT
        ROW_NUMBER() OVER () AS __sda_position,
        source AS __sda_row
      FROM hashFirst AS source
    )
    SELECT
      CAST(COUNT(*) AS VARCHAR) AS row_count,
      CAST(
        COALESCE(BIT_XOR(MD5_NUMBER(numbered::VARCHAR)), 0)
        AS VARCHAR
      ) AS checksum
    FROM numbered`,
    { returnData: true, dataTransport: "direct" },
  )) as { row_count: string; checksum: string }[];
  const expectedHash = crypto.createHash("sha256").update(JSON.stringify([
    "sda-table-hash-v1",
    Object.entries(await first.getTypes()),
    summary[0].row_count,
    summary[0].checksum,
  ])).digest("hex");

  assertMatch(firstHash, /^[a-f0-9]{64}$/);
  assertEquals(firstHash, expectedHash);
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
