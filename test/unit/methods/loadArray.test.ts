import { assertEquals, assertThrows } from "@std/assert";
import { DuckDBTimeValue } from "@duckdb/node-api";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("should load an array of objects into a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      key1: 1,
      key2: "un",
      key3: new Date("2010-01-01"),
      key4: true,
    },
    {
      key1: NaN,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    {
      key1: 3,
      key2: undefined,
      key3: new Date("2010-01-03"),
      key4: false,
    },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    { key1: 1, key2: "un", key3: new Date("2010-01-01"), key4: true },
    {
      key1: null,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    { key1: 3, key2: null, key3: new Date("2010-01-03"), key4: false },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  await sdb.close();
});

Deno.test("should load an array of objects into a table and return the table", async () => {
  const sdb = new SimpleDB();
  const table = await sdb.newTable().loadArray([
    {
      key1: 1,
      key2: "un",
      key3: new Date("2010-01-01"),
      key4: true,
    },
    {
      key1: NaN,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    {
      key1: 3,
      key2: undefined,
      key3: new Date("2010-01-03"),
      key4: false,
    },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  assertEquals(table instanceof SimpleTable, true);
  await table.run();
  await sdb.close();
});

Deno.test("should load an array of objects into a table with spaces in column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": "un",
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": "un",
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  await sdb.close();
});
Deno.test("should load an array of objects even if the first rows have null values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  await sdb.close();
});
Deno.test("should load an array of objects even if the all values in a column are null", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": null,
    },
    {
      "column 1": 3,
      "column 2": null,
    },
    {
      "column 1": 4,
      "column 2": null,
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": null,
    },
    {
      "column 1": 3,
      "column 2": null,
    },
    {
      "column 1": 4,
      "column 2": null,
    },
  ]);

  const types = await table.getTypes();

  assertEquals(types, {
    "column 1": "DOUBLE",
    "column 2": "VARCHAR",
  });

  await sdb.close();
});

Deno.test("should throw a clear error for an empty array", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("emptyArray");

  let error: unknown;
  try {
    table.loadArray([]);
  } catch (e) {
    error = e;
  }
  assertEquals(
    (error as Error).message,
    "The array is empty. loadArray needs at least one object to infer the column types.",
  );
  await sdb.close();
});

Deno.test("loadArray captures row, Date, and array values when queued", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("capturedArray");
  const date = new Date("2020-01-02T03:04:05.000Z");
  const vector = [1, 2];
  const row = { name: "before", date, vector };
  const rows = [
    row,
    { name: "empty", date: null, vector: null },
  ];

  table.loadArray(rows);
  row.name = "after";
  date.setUTCFullYear(2030);
  vector[0] = 99;
  rows.push({
    name: "later",
    date: new Date("2040-01-01T00:00:00.000Z"),
    vector: [8, 9],
  });

  const result = await sdb.customQuery(
    `SELECT name, date, vector[1] AS first FROM "capturedArray"`,
    { returnData: true },
  );
  assertEquals(result, [
    {
      name: "before",
      date: new Date("2020-01-02T03:04:05.000Z"),
      first: 1,
    },
    { name: "empty", date: null, first: null },
  ]);

  await sdb.close();
});

Deno.test("library SQL supports double quotes in table and column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable('people "archive"');

  const result = await table
    .loadArray([{ 'full "name"': "Ada" }])
    .sort({ 'full "name"': "asc" })
    .getData({ columns: 'full "name"' });

  assertEquals(result, [{ 'full "name"': "Ada" }]);
  await sdb.close();
});

Deno.test("loadArray snapshots partial column type overrides", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    const options: {
      columnTypes: { value: "number" | "BOOLEAN" | "INTEGER" };
    } = { columnTypes: { value: "number" } };
    table.loadArray([{ name: "A", value: null }, {
      name: "B",
      value: undefined,
    }], options);
    options.columnTypes.value = "BOOLEAN";
    options.columnTypes = { value: "INTEGER" };
    assertEquals(await table.getTypes(), { name: "VARCHAR", value: "DOUBLE" });
    assertEquals(await table.getData(), [{ name: "A", value: null }, {
      name: "B",
      value: null,
    }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray supports explicit SQL types and JavaScript aliases", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [type, value, expected] of [
        ["integer", 42, "INTEGER"],
        ["BIGINT", 42n, "BIGINT"],
        ["number", 1.5, "DOUBLE"],
        ["float", 1.5, "DOUBLE"],
        ["DOUBLE", 1.5, "DOUBLE"],
        ["string", "hello", "VARCHAR"],
        ["VARCHAR", "hello", "VARCHAR"],
        ["boolean", true, "BOOLEAN"],
        ["date", new Date("2020-01-01"), "DATE"],
        ["datetime", new Date("2020-01-01T12:34:56Z"), "TIMESTAMP"],
        ["TIMESTAMP", new Date("2020-01-01"), "TIMESTAMP"],
        ["datetimeTz", new Date("2020-01-01"), "TIMESTAMP WITH TIME ZONE"],
        [
          "timestamp with time zone",
          new Date("2020-01-01"),
          "TIMESTAMP WITH TIME ZONE",
        ],
        ["TIME", new DuckDBTimeValue(123456n), "TIME"],
        ["FLOAT[2]", [1.5, 2], "FLOAT[2]"],
      ] as const
    ) {
      const table = sdb.newTable().loadArray([{ value }], {
        columnTypes: { value: type },
      });
      assertEquals(await table.getTypes(), { value: expected });
      await table.getData();
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray rejects invalid overrides before replacing existing data", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 7 }]);
    await table.run();
    assertThrows(
      () =>
        table.loadArray([{ value: null }], {
          columnTypes: { missing: "DOUBLE" },
        }),
      Error,
      'Unknown column "missing"',
    );
    for (
      const type of [
        "invalid",
        "DOUBLE); DROP TABLE x; --",
        "FLOAT[2] trailing",
        "GEOMETRY",
      ]
    ) {
      assertThrows(
        () =>
          // @ts-expect-error Unsupported type names are also rejected at compile time.
          table.loadArray([{ value: null }], { columnTypes: { value: type } }),
        Error,
        "Unsupported type",
      );
    }
    for (
      const [type, value, loss] of [
        ["INTEGER", 1.5, true],
        ["INTEGER", 2147483648, true],
        ["INTEGER", -2147483649, true],
        ["BIGINT", 9223372036854775808n, true],
        ["BIGINT", 2 ** 63, true],
        ["BIGINT", -(2 ** 63) - 2048, true],
        ["BIGINT", 1.5, true],
        ["DOUBLE", 9007199254740993n, true],
        ["INTEGER", Infinity, true],
        ["INTEGER", "42", false],
        ["VARCHAR", 42, false],
        ["BOOLEAN", 1, false],
        ["TIMESTAMP", "2020-01-01", false],
        ["TIMESTAMP", new Date(NaN), false],
        ["DATE", new Date("2020-01-01T00:00:00.001Z"), true],
        ["TIME", new Date("2020-01-01"), true],
        ["FLOAT[2]", [0.1, 2], true],
        ["FLOAT[2]", [1], true],
      ] as const
    ) {
      const error = assertThrows(
        () =>
          table.loadArray([{ value: null }, { value }], {
            columnTypes: { value: type },
          }),
        Error,
      );
      const displayed = typeof value === "string"
        ? JSON.stringify(value)
        : String(value);
      assertEquals(
        error.message,
        `Column "value", row 2: value ${displayed} ${
          loss
            ? `cannot be stored as ${type} without losing information`
            : `is incompatible with ${type}`
        }. Select a type compatible with this value.`,
      );
    }
    assertEquals(await table.getData(), [{ value: 7 }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray preserves exact numeric values under overrides", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      {
        integer: -2147483648,
        big: -9223372036854775808n,
        double: 9007199254740992n,
      },
      { integer: 2147483647, big: 42, double: 0.1 },
    ], {
      columnTypes: { integer: "INTEGER", big: "BIGINT", double: "DOUBLE" },
    });
    assertEquals(
      await sdb.customQuery(
        `SELECT integer, big::VARCHAR AS big, double FROM "${table.name}"`,
        { returnData: true },
      ),
      [
        {
          integer: -2147483648,
          big: "-9223372036854775808",
          double: 9007199254740992,
        },
        { integer: 2147483647, big: "42", double: 0.1 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray snapshots explicitly typed dates and arrays without losing values", async () => {
  const sdb = new SimpleDB();
  try {
    const date = new Date("2020-01-01T12:34:56.789Z");
    const vector = [1.5, 2];
    const table = sdb.newTable().loadArray([
      { date, vector, missing: NaN },
    ], {
      columnTypes: {
        date: "datetimeTz",
        vector: "FLOAT[2]",
        missing: "INTEGER",
      },
    });
    date.setUTCFullYear(2030);
    vector[0] = 99;
    assertEquals(
      await sdb.customQuery(
        `SELECT date::TIMESTAMP AS date, vector[1] AS first, vector[2] AS second, missing FROM "${table.name}"`,
        { returnData: true },
      ),
      [{
        date: new Date("2020-01-01T12:34:56.789Z"),
        first: 1.5,
        second: 2,
        missing: null,
      }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray preserves numeric BIGINT boundaries", async () => {
  const sdb = new SimpleDB();
  try {
    const values = [-(2 ** 63), 2 ** 63 - 1024, 9007199254740992];
    const table = sdb.newTable().loadArray(values.map((value) => ({ value })), {
      columnTypes: { value: "BIGINT" },
    });
    assertEquals(
      await sdb.customQuery(
        `SELECT value::VARCHAR AS value FROM "${table.name}"`,
        { returnData: true },
      ),
      values.map((value) => ({ value: BigInt(value).toString() })),
    );
  } finally {
    await sdb.close();
  }
});
