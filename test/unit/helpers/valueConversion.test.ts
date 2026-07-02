import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

// Pins the conversion of DuckDB values to JS values on the read path
// for all the types SDA can emit, including NULLs, NaN, ±Infinity and
// the timezone behavior of dates.

const allTypesQuery = `SELECT
  true AS bool,
  1::TINYINT AS tiny,
  2::SMALLINT AS small,
  3::INTEGER AS integ,
  4::BIGINT AS big,
  9007199254740993::BIGINT AS bigUnsafe,
  170141183460469231731687303715884105727::HUGEINT AS huge,
  5::UBIGINT AS ubig,
  1.5::FLOAT AS flt,
  2.5::DOUBLE AS dbl,
  'NaN'::DOUBLE AS nan,
  'Infinity'::DOUBLE AS inf,
  '-Infinity'::DOUBLE AS ninf,
  123.456::DECIMAL(18,3) AS dec,
  'hello' AS varch,
  '' AS emptyStr,
  DATE '2020-01-15' AS dt,
  TIMESTAMP '2020-01-15 14:30:45.123456' AS ts,
  TIME '14:30:45' AS tm,
  INTERVAL 2 MONTH + INTERVAL 3 DAY + INTERVAL 4 SECOND AS itv,
  '550e8400-e29b-41d4-a716-446655440000'::UUID AS uuid,
  'abc'::BLOB AS blob,
  [1, 2, 3] AS intList,
  ['a', 'b'] AS strList,
  [4::BIGINT, 5::BIGINT] AS bigList,
  {'a': 1, 'b': 'x'} AS strct,
  MAP {'k': 1} AS mp,
  [1.0, 2.0]::FLOAT[2] AS fltArr,
  [1.0, 2.0]::FLOAT[] AS fltList,
  [1.0, 2.0]::DOUBLE[] AS dblList,
  NULL::INTEGER AS nullInt,
  NULL::DATE AS nullDate,
  NULL::TIMESTAMP AS nullTs,
  NULL::BIGINT AS nullBig,
  NULL::DOUBLE AS nullDbl,
  NULL::VARCHAR AS nullStr,
  NULL::BOOLEAN AS nullBool`;

const expectedAllTypesRow = {
  bool: true,
  tiny: 1,
  small: 2,
  integ: 3,
  big: 4,
  bigUnsafe: 9007199254740992, // precision loss beyond Number.MAX_SAFE_INTEGER
  huge: 1.7014118346046923e+38,
  ubig: "5",
  flt: 1.5,
  dbl: 2.5,
  nan: "NaN",
  inf: "Infinity",
  ninf: "-Infinity",
  dec: "123.456",
  varch: "hello",
  emptyStr: "",
  dt: new Date("2020-01-15T00:00:00.000Z"),
  ts: new Date("2020-01-15T14:30:45.123Z"), // truncated to milliseconds
  tm: "14:30:45",
  itv: { months: 2, days: 3, micros: "4000000" },
  uuid: "550e8400-e29b-41d4-a716-446655440000",
  blob: "abc",
  intList: [1, 2, 3],
  strList: ["a", "b"],
  bigList: ["4", "5"],
  strct: { a: 1, b: "x" },
  mp: [{ key: "k", value: 1 }],
  fltArr: "<FLOAT[2]>",
  fltList: "<FLOAT[]>",
  dblList: [1, 2],
  nullInt: null,
  nullDate: null,
  nullTs: null,
  nullBig: null,
  nullDbl: null,
  nullStr: null,
  nullBool: null,
};

Deno.test("should convert all DuckDB types read from a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("allTypes");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "allTypes" AS ${allTypesQuery}`,
  );
  const rows = await table.getData();
  // Cast: lists, structs, maps and intervals are returned as arrays and
  // objects at runtime, which the declared row type does not admit yet
  // (issue #78, Phase 3).
  assertEquals(rows as unknown, [expectedAllTypesRow]);
  await sdb.done();
});

Deno.test("should keep TIMESTAMP WITH TIME ZONE values as strings", async () => {
  const sdb = new SimpleDB();
  await sdb.customQuery(`SET TimeZone='UTC'`);
  const table = sdb.newTable("tstz");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "tstz" AS SELECT TIMESTAMPTZ '2020-01-15 14:30:45' AS tstz`,
  );
  const rows = await table.getData();
  const value = rows[0].tstz;
  // The string offset depends on the process timezone, but the format is
  // stable and the value must round-trip to the same instant.
  assertEquals(typeof value, "string");
  const match = (value as string).match(
    /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})([+-]\d{2}(:\d{2})?)$/,
  );
  assertEquals(match !== null, true);
  const offset = match![3].includes(":") ? match![3] : `${match![3]}:00`;
  assertEquals(
    new Date(`${match![1]}T${match![2]}${offset}`).getTime(),
    new Date("2020-01-15T14:30:45.000Z").getTime(),
  );
  await sdb.done();
});

Deno.test("should convert dates and timestamps as UTC", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("dates");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "dates" AS SELECT
      DATE '2020-01-15' AS dt,
      DATE '1969-12-31' AS dtBeforeEpoch,
      TIMESTAMP '2020-01-15 14:30:45' AS ts,
      TIMESTAMP '1969-12-31 23:59:59.999999' AS tsBeforeEpoch`,
  );
  const rows = await table.getData();
  assertEquals(rows[0].dt, new Date(Date.UTC(2020, 0, 15)));
  assertEquals(rows[0].dtBeforeEpoch, new Date(Date.UTC(1969, 11, 31)));
  assertEquals(
    rows[0].ts,
    new Date(Date.UTC(2020, 0, 15, 14, 30, 45)),
  );
  // Sub-millisecond precision is truncated toward the past
  assertEquals(
    rows[0].tsBeforeEpoch,
    new Date(Date.UTC(1969, 11, 31, 23, 59, 59, 999)),
  );
  await sdb.done();
});

Deno.test("should return an empty array for an empty result", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("empty");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "empty" AS SELECT 1 AS a WHERE false`,
  );
  const rows = await table.getData();
  assertEquals(rows, []);
  await sdb.done();
});

Deno.test("should convert computed values from a SimpleDB custom query", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("computedSource");
  await table.loadArray([
    { category: "a", value: 10 },
    { category: "b", value: 20 },
    { category: "b", value: 30 },
  ]);
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "computedSource2" AS SELECT category, value, DATE '2020-01-15' AS dt FROM "computedSource"`,
  );

  // Computed columns are not part of any table schema: their types now
  // come from the query result itself, so counts are numbers and
  // dates are Date objects even here.
  const data = await sdb.customQuery(
    `SELECT count(*) AS cnt, max(dt) AS maxDate, sum(value)::BIGINT AS sumValue FROM "computedSource2"`,
    { returnDataFrom: "query" },
  );
  assertEquals(data, [
    {
      cnt: 3,
      maxDate: new Date("2020-01-15T00:00:00.000Z"),
      sumValue: 60,
    },
  ]);
  await sdb.done();
});

Deno.test("should convert computed columns not present in any table schema", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("computedCols");
  await table.loadArray([
    { category: "a", value: 10 },
    { category: "b", value: 20 },
  ]);
  const data = await sdb.customQuery(
    `SELECT category || '!' AS exclaimed, count(*)::BIGINT AS cnt FROM "computedCols" GROUP BY category ORDER BY category`,
    { returnDataFrom: "query", table: "computedCols" },
  );
  assertEquals(data, [
    { exclaimed: "a!", cnt: 1 },
    { exclaimed: "b!", cnt: 1 },
  ]);
  await sdb.done();
});

Deno.test("should warn once per column for unsafe BIGINT values", async () => {
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (...args: unknown[]) => {
    warnings.push(args.map(String).join(" "));
  };
  try {
    const sdb = new SimpleDB();
    const table = sdb.newTable("unsafeBig");
    await sdb.customQuery(
      `CREATE OR REPLACE TABLE "unsafeBig" AS SELECT * FROM (VALUES
        (9007199254740993::BIGINT, 1::BIGINT),
        (9007199254740995::BIGINT, 2::BIGINT)
      ) AS t(unsafe, safe)`,
    );
    const rows = await table.getData();
    assertEquals(rows, [
      { unsafe: 9007199254740992, safe: 1 },
      { unsafe: 9007199254740996, safe: 2 },
    ]);
    const unsafeWarnings = warnings.filter((w) => w.includes("unsafe"));
    assertEquals(unsafeWarnings.length, 1);
    assertEquals(
      warnings.filter((w) => w.includes('"safe"')).length,
      0,
    );
    await sdb.done();
  } finally {
    console.warn = originalWarn;
  }
});
