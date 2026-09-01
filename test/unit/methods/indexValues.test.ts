import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should index values against a calculated statistic", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ cpi: 10 }, { cpi: 20 }, { cpi: 30 }]);

  table.indexValues("cpi", "cpiIndexed", { stat: "mean" });

  assertEquals(await table.getData(), [
    { cpi: 10, cpiIndexed: 50 },
    { cpi: 20, cpiIndexed: 100 },
    { cpi: 30, cpiIndexed: 150 },
  ]);
  await sdb.close();
});

Deno.test("should index grouped values against an exact date reference", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { country: "B", date: new Date("2002-01-01T00:00:00Z"), cpi: 75 },
    { country: "A", date: new Date("2000-01-01T00:00:00Z"), cpi: 10 },
    { country: "B", date: new Date("2000-01-01T00:00:00Z"), cpi: 25 },
    { country: "A", date: new Date("2002-01-01T00:00:00Z"), cpi: 30 },
    { country: "B", date: new Date("2001-01-01T00:00:00Z"), cpi: 50 },
    { country: "A", date: new Date("2001-01-01T00:00:00Z"), cpi: 20 },
  ]);

  table.indexValues(
    "cpi",
    "cpiIndexed",
    {
      column: "date",
      equals: new Date("2001-01-01T00:00:00Z"),
    },
    { by: "country", base: 100, decimals: 1 },
  );

  assertEquals(await table.getData(), [
    {
      country: "B",
      date: new Date("2002-01-01T00:00:00Z"),
      cpi: 75,
      cpiIndexed: 150,
    },
    {
      country: "A",
      date: new Date("2000-01-01T00:00:00Z"),
      cpi: 10,
      cpiIndexed: 50,
    },
    {
      country: "B",
      date: new Date("2000-01-01T00:00:00Z"),
      cpi: 25,
      cpiIndexed: 50,
    },
    {
      country: "A",
      date: new Date("2002-01-01T00:00:00Z"),
      cpi: 30,
      cpiIndexed: 150,
    },
    {
      country: "B",
      date: new Date("2001-01-01T00:00:00Z"),
      cpi: 50,
      cpiIndexed: 100,
    },
    {
      country: "A",
      date: new Date("2001-01-01T00:00:00Z"),
      cpi: 20,
      cpiIndexed: 100,
    },
  ]);
  await sdb.close();
});

Deno.test("should require exactly one matching reference row in every group", async () => {
  const missingDb = new SimpleDB();
  const missingTable = missingDb.newTable();
  missingTable.loadArray([
    { group: "A", period: 1, value: 10 },
    { group: "A", period: 2, value: 20 },
    { group: "B", period: 1, value: 30 },
  ]);
  missingTable.indexValues(
    "value",
    "indexed",
    { column: "period", equals: 2 },
    { by: "group" },
  );

  await assertRejects(
    () => missingTable.run(),
    Error,
    "indexValues() found no reference row for at least one group",
  );
  await missingDb.close();

  const duplicateDb = new SimpleDB();
  const duplicateTable = duplicateDb.newTable();
  duplicateTable.loadArray([
    { period: 1, value: 10 },
    { period: 1, value: 20 },
  ]);
  duplicateTable.indexValues(
    "value",
    "indexed",
    { column: "period", equals: 1 },
  );

  await assertRejects(
    () => duplicateTable.run(),
    Error,
    "indexValues() found multiple reference rows for at least one group",
  );
  await duplicateDb.close();
});

Deno.test("should support calculated reference statistics", async () => {
  const cases = [
    { stat: "min", expected: [100, 200, 400, null] },
    { stat: "max", expected: [25, 50, 100, null] },
    { stat: "mean", expected: [42.86, 85.71, 171.43, null] },
    { stat: "median", expected: [50, 100, 200, null] },
  ] as const;

  for (const testCase of cases) {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadArray([{ value: 1 }, { value: 2 }, { value: 4 }, {
      value: null,
    }]);
    table.indexValues("value", "indexed", { stat: testCase.stat }, {
      decimals: 2,
    });

    assertEquals(
      (await table.getData()).map((row) => row.indexed),
      [...testCase.expected],
      `Unexpected result for ${testCase.stat}`,
    );
    await sdb.close();
  }
});

Deno.test("should bind supported scalar reference values", async () => {
  const cases = [
    { column: "text", equals: "reference" },
    { column: "number", equals: 2 },
    { column: "bigint", equals: 2n },
    { column: "boolean", equals: true },
    {
      column: "timestamp",
      equals: new Date("2001-01-01T12:34:56.789Z"),
    },
  ] as const;

  for (const testCase of cases) {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadArray([
      {
        text: "other",
        number: 1,
        bigint: 1n,
        boolean: false,
        timestamp: new Date("2000-01-01T00:00:00Z"),
        value: 10,
      },
      {
        text: "reference",
        number: 2,
        bigint: 2n,
        boolean: true,
        timestamp: new Date("2001-01-01T12:34:56.789Z"),
        value: 20,
      },
    ]);
    table.indexValues(
      "value",
      "indexed",
      { column: testCase.column, equals: testCase.equals },
    );

    assertEquals(
      (await table.getData()).map((row) => row.indexed),
      [50, 100],
      `Unexpected result for ${testCase.column}`,
    );
    await sdb.close();
  }
});

Deno.test("should reject cross-type exact reference values", async () => {
  const cases = [
    {
      rows: [{ period: "01", value: 20 }],
      reference: { column: "period", equals: 1 } as const,
      message:
        'indexValues() reference.equals must be a string for column "period" with type VARCHAR, but received number',
    },
    {
      rows: [{ period: 1, value: 20 }],
      reference: { column: "period", equals: "01" } as const,
      message:
        'indexValues() reference.equals must be a number or bigint for column "period" with type DOUBLE, but received string',
    },
  ];

  for (const testCase of cases) {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadArray(testCase.rows);
    table.indexValues("value", "indexed", testCase.reference);

    await assertRejects(() => table.run(), Error, testCase.message);
    await sdb.close();
  }
});

Deno.test("should match DATE, TIMESTAMP, and TIMESTAMPTZ references", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("temporalReferences");
  await sdb.customQuery(`CREATE TABLE "temporalReferences" AS
    SELECT
      DATE '2001-01-01' AS date_reference,
      TIMESTAMP '2001-01-01 12:34:56.789' AS timestamp_reference,
      TIMESTAMPTZ '2001-01-01 00:00:00+00' AS timestamptz_reference,
      20 AS value
    UNION ALL
    SELECT
      DATE '2002-01-01',
      TIMESTAMP '2002-01-01 12:34:56.789',
      TIMESTAMPTZ '2002-01-01 00:00:00+00',
      40`);
  await sdb.customQuery("SET TimeZone = 'America/Toronto'");

  table.indexValues("value", "indexedDate", {
    column: "date_reference",
    equals: new Date("2001-01-01T00:00:00Z"),
  });
  table.indexValues("value", "indexedTimestamp", {
    column: "timestamp_reference",
    equals: new Date("2001-01-01T12:34:56.789Z"),
  });
  table.indexValues("value", "indexedTimestampTz", {
    column: "timestamptz_reference",
    equals: new Date("2001-01-01T00:00:00Z"),
  });

  assertEquals(
    (await table.getData()).map((row) => ({
      indexedDate: row.indexedDate,
      indexedTimestamp: row.indexedTimestamp,
      indexedTimestampTz: row.indexedTimestampTz,
    })),
    [
      { indexedDate: 100, indexedTimestamp: 100, indexedTimestampTz: 100 },
      { indexedDate: 200, indexedTimestamp: 200, indexedTimestampTz: 200 },
    ],
  );
  await sdb.close();
});

Deno.test("should require an exact temporal reference", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("microsecondReference");
  await sdb.customQuery(`CREATE TABLE "microsecondReference" AS
    SELECT TIMESTAMP '2001-01-01 00:00:00.000500' AS timestamp_reference,
    20 AS value`);
  table.indexValues("value", "indexed", {
    column: "timestamp_reference",
    equals: new Date("2001-01-01T00:00:00.000Z"),
  });

  await assertRejects(
    () => table.run(),
    Error,
    "indexValues() found no reference row",
  );
  await sdb.close();
});

Deno.test("should reject invalid references and options at call time", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ period: 1, value: 10 }]);

  assertThrows(
    () =>
      table.indexValues(
        "value",
        "indexed",
        // @ts-expect-error Null reference values are deliberately unsupported.
        { column: "period", equals: null },
      ),
    Error,
    "indexValues() reference.equals cannot be null or undefined",
  );
  assertThrows(
    () =>
      table.indexValues(
        "value",
        "indexed",
        // @ts-expect-error Count statistics are deliberately unsupported.
        { stat: "count" },
      ),
    Error,
    "indexValues() reference.stat must be one of",
  );
  assertThrows(
    () =>
      table.indexValues("value", "indexed", { stat: "mean" }, {
        base: 0,
      }),
    Error,
    "indexValues() options.base must be a finite number greater than 0",
  );
  assertThrows(
    () =>
      table.indexValues("value", "indexed", { stat: "mean" }, {
        decimals: 1.5,
      }),
    Error,
    "indexValues() options.decimals must be a finite integer greater than or equal to 0",
  );

  await sdb.close();
});

Deno.test("should validate columns when the operation runs", async () => {
  const cases = [
    {
      column: "missing",
      newColumn: "indexed",
      reference: { stat: "mean" } as const,
      options: {},
      message: 'indexValues() the column "missing" does not exist',
    },
    {
      column: "label",
      newColumn: "indexed",
      reference: { stat: "mean" } as const,
      options: {},
      message:
        'indexValues() requires a numeric column, but "label" has type VARCHAR',
    },
    {
      column: "value",
      newColumn: "indexed",
      reference: { column: "missing", equals: 1 } as const,
      options: {},
      message: 'indexValues() the column "missing" does not exist',
    },
    {
      column: "value",
      newColumn: "indexed",
      reference: { stat: "mean" } as const,
      options: { by: "missing" },
      message: 'indexValues() the column "missing" does not exist',
    },
    {
      column: "value",
      newColumn: "label",
      reference: { stat: "mean" } as const,
      options: {},
      message: 'indexValues() the column "label" already exists',
    },
  ];

  for (const testCase of cases) {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadArray([{ label: "a", value: 10 }]);
    table.indexValues(
      testCase.column,
      testCase.newColumn,
      testCase.reference,
      testCase.options,
    );
    await assertRejects(() => table.run(), Error, testCase.message);
    await sdb.close();
  }
});

Deno.test("should index supported numeric column types and preserve nulls", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("numericTypes");
  await sdb.customQuery(`CREATE TABLE "numericTypes" AS
    SELECT 1 AS period, 10::INTEGER AS integer_value,
      10::BIGINT AS bigint_value, 10.5::DOUBLE AS double_value,
      10.50::DECIMAL(10, 2) AS decimal_value
    UNION ALL
    SELECT 2, 20, 20, 21, 21
    UNION ALL
    SELECT 3, NULL, NULL, NULL, NULL`);

  for (
    const column of [
      "integer_value",
      "bigint_value",
      "double_value",
      "decimal_value",
    ]
  ) {
    table.indexValues(column, `${column}_indexed`, {
      column: "period",
      equals: 2,
    });
  }

  const data = await table.getData();
  for (
    const column of [
      "integer_value",
      "bigint_value",
      "double_value",
      "decimal_value",
    ]
  ) {
    assertEquals(
      data.map((row) => row[`${column}_indexed`]),
      [50, 100, null],
      `Unexpected result for ${column}`,
    );
  }
  await sdb.close();
});

Deno.test("should calculate statistical references within multiple grouping columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { region: "A", year: 2020, value: 10 },
    { region: "A", year: 2020, value: 20 },
    { region: "A", year: 2021, value: 30 },
    { region: "A", year: 2021, value: 60 },
    { region: "B", year: 2020, value: 5 },
    { region: "B", year: 2020, value: 10 },
  ]);
  table.indexValues("value", "indexed", { stat: "mean" }, {
    by: ["region", "year"],
    base: 100,
    decimals: 2,
  });

  assertEquals(
    (await table.getData()).map((row) => row.indexed),
    [66.67, 133.33, 66.67, 133.33, 66.67, 133.33],
  );
  await sdb.close();
});

Deno.test("should reject null and zero calculated or selected reference values", async () => {
  const cases = [
    {
      rows: [{ period: 1, value: null }, { period: 2, value: 10 }],
      reference: { column: "period", equals: 1 } as const,
      message: "indexValues() found a NULL reference value",
    },
    {
      rows: [{ period: 1, value: 0 }, { period: 2, value: 10 }],
      reference: { column: "period", equals: 1 } as const,
      message: "indexValues() found a zero reference value",
    },
    {
      rows: [
        { group: "A", value: null },
        { group: "A", value: null },
        { group: "B", value: 1 },
      ],
      reference: { stat: "mean" } as const,
      options: { by: "group" },
      message: "indexValues() calculated a NULL reference value",
    },
    {
      rows: [{ value: -1 }, { value: 1 }],
      reference: { stat: "mean" } as const,
      message: "indexValues() calculated a zero reference value",
    },
  ];

  for (const testCase of cases) {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadArray(testCase.rows);
    table.indexValues(
      "value",
      "indexed",
      testCase.reference,
      "options" in testCase ? testCase.options : {},
    );
    await assertRejects(() => table.run(), Error, testCase.message);
    await sdb.close();
  }
});

Deno.test("should snapshot mutable reference and option inputs", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { group: "A", date: new Date("2001-01-01T00:00:00Z"), value: 10 },
    { group: "A", date: new Date("2002-01-01T00:00:00Z"), value: 20 },
  ]);
  const date = new Date("2001-01-01T00:00:00Z");
  const by = ["group"];
  table.indexValues(
    "value",
    "indexed",
    { column: "date", equals: date },
    { by },
  );
  date.setUTCFullYear(2002);
  by[0] = "missing";

  assertEquals(
    (await table.getData()).map((row) => row.indexed),
    [100, 200],
  );
  await sdb.close();
});

Deno.test("should apply a custom base", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { period: 1, value: 10 },
    { period: 2, value: 20 },
  ]);
  table.indexValues(
    "value",
    "indexed",
    { column: "period", equals: 2 },
    { base: 1_000 },
  );

  assertEquals(
    (await table.getData()).map((row) => row.indexed),
    [500, 1_000],
  );
  await sdb.close();
});

Deno.test("should index against rows selected by column extrema", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { country: "A", date: new Date("2000-01-01T00:00:00Z"), cpi: 10 },
    { country: "A", date: new Date("2001-01-01T00:00:00Z"), cpi: 15 },
    { country: "B", date: new Date("1999-01-01T00:00:00Z"), cpi: 20 },
    { country: "B", date: new Date("2001-01-01T00:00:00Z"), cpi: 30 },
  ]);

  table.indexValues(
    "cpi",
    "indexedToFirst",
    { column: "date", at: "min" },
    { by: "country", decimals: 2 },
  );
  table.indexValues(
    "cpi",
    "indexedToLast",
    { column: "date", at: "max" },
    { by: "country", decimals: 2 },
  );

  assertEquals(
    (await table.getData()).map((row) => ({
      indexedToFirst: row.indexedToFirst,
      indexedToLast: row.indexedToLast,
    })),
    [
      { indexedToFirst: 100, indexedToLast: 66.67 },
      { indexedToFirst: 150, indexedToLast: 100 },
      { indexedToFirst: 100, indexedToLast: 66.67 },
      { indexedToFirst: 150, indexedToLast: 100 },
    ],
  );
  await sdb.close();
});

Deno.test("should reject tied and invalid column-at references", async () => {
  const invalidDb = new SimpleDB();
  const invalidTable = invalidDb.newTable();
  invalidTable.loadArray([{ date: new Date("2001-01-01T00:00:00Z"), cpi: 10 }]);
  assertThrows(
    () =>
      invalidTable.indexValues(
        "cpi",
        "indexed",
        // @ts-expect-error Column-at references only support extrema.
        { column: "date", at: "mean" },
      ),
    Error,
    'indexValues() reference.at must be "min" or "max"',
  );
  await invalidDb.close();

  const tiedDb = new SimpleDB();
  const tiedTable = tiedDb.newTable();
  tiedTable.loadArray([
    { date: new Date("2001-01-01T00:00:00Z"), cpi: 10 },
    { date: new Date("2001-01-01T00:00:00Z"), cpi: 20 },
    { date: new Date("2002-01-01T00:00:00Z"), cpi: 30 },
  ]);
  tiedTable.indexValues("cpi", "indexed", { column: "date", at: "min" });

  await assertRejects(
    () => tiedTable.run(),
    Error,
    "indexValues() found multiple reference rows",
  );
  await tiedDb.close();
});
