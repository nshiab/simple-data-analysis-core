import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should log a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with 100 rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log(100);

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with 100 rows in options", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");

  const originalLog = console.log;
  const output: string[] = [];
  try {
    console.log = (...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    };
    await table.log({ count: 100 });
    assertEquals(output.some((line) => line.includes("count: 100")), true);
  } finally {
    console.log = originalLog;
  }
  await sdb.close();
});
Deno.test("should log a table with types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ types: true });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should allow local types option to override the default", async () => {
  const sdb = new SimpleDB({ typesToLog: true });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");

  let getTypesCalled = false;
  const getTypes = table.getTypes.bind(table);
  table.getTypes = () => {
    getTypesCalled = true;
    return getTypes();
  };

  await table.log({ types: false });

  assertEquals(getTypesCalled, false);
  await sdb.close();
});
Deno.test("should log a table with 100 rows and types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ types: true, count: 100 });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should not throw an error when there is no table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("should log '<Geometry>' for geospatial data", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("should log types even if there is just one column in the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  table.selectColumns("Name");
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with a condition", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ conditions: `Name === 'OConnell, Donald'` });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with 'all'", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log("all");

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with { count: 'all'}", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ count: "all" });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with long strings and word wrap the columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log different colors for different data types", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  const dataArray = [
    {
      name: "Alice",
      age: 30,
      isStudent: false,
      birthday: new Date("1993-01-01"),
      salary: null,
    },
    {
      name: "Bob",
      age: 25,
      isStudent: true,
      birthday: new Date("1998-05-15"),
      salary: 50000,
    },
  ];
  console.table(dataArray);
  table.loadArray(dataArray);
  await table.log();
  await table.log({ types: true });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("log preserves SQL display precision, nested structure, and numeric colors", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(`CREATE TABLE display_values AS SELECT
      42::UBIGINT AS id, 1234567890123456.789::DECIMAL(19,3) AS amount,
      DATE '2025-01-01' AS date,
      TIMESTAMP '2025-01-01 00:00:00.123456' AS ts,
      TIMESTAMP_NS '2025-01-01 00:00:00.123456789' AS ns,
      TIMESTAMPTZ '2025-01-01 00:00:00.123456+00' AS tz,
      [1, NULL, 3]::INTEGER[] AS items,
      {'id': 9007199254740993::BIGINT, 'count': 2} AS nested,
      'NaN'::DOUBLE AS nan, 'Infinity'::DOUBLE AS inf,
      '-Infinity'::DOUBLE AS neg, '123.450' AS text`);
    const table = sdb.newTable("display_values");
    const before = await table.getData();
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    for (const types of [false, true]) {
      lines.length = 0;
      await table.log({ types });
      const output = lines.join("\n");
      for (
        const text of [
          "2025-01-01",
          "2025-01-01 00:00:00.123456",
          "2025-01-01 00:00:00.123456789",
          "2025-01-01 00:00:00.123456+00",
          "[1,null,3]",
          '{"id":"9007199254740993","count":2}',
          "\x1b[33m1234567890123456.789",
          "\x1b[33mNaN",
          "\x1b[33mInfinity",
          "\x1b[33m-Infinity",
          "\x1b[32m123.450",
        ]
      ) {
        assertEquals(output.includes(text), true, text);
      }
      assertEquals(output.includes("2025-01-01T"), false);
      if (types) assertEquals(output.includes("UBIGINT/number"), true);
    }
    assertEquals(await table.getData(), before);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

Deno.test("log handles temporal infinities and null-first or all-null type annotations", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(`CREATE TABLE boundaries AS SELECT * FROM (VALUES
      (NULL::INTEGER, NULL::BIGINT, DATE 'infinity', TIMESTAMP '-infinity'),
      (2, NULL, DATE '-infinity', TIMESTAMP 'infinity')) AS t(value, empty, date, ts)`);
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    await sdb.newTable("boundaries").log({ types: true });
    const output = lines.join("\n");
    for (
      const text of [
        "INTEGER/number",
        "BIGINT/number",
        "infinity",
        "-infinity",
        "null",
      ]
    ) {
      assertEquals(output.includes(text), true, text);
    }
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

Deno.test("log truncates serialized nested values using the default character budget", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(
      `CREATE TABLE long_nested AS SELECT {'text': repeat('x', 200)} AS nested`,
    );
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const table = sdb.newTable("long_nested");
    assertEquals(table.charsToLog, 75);
    await table.log();
    assertEquals(
      lines.join("\n").includes('{"text":"' + "x".repeat(63) + "..."),
      true,
    );
    assertEquals((await table.getData())[0].nested, { text: "x".repeat(200) });
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

Deno.test("log stringifies nested temporal values instead of treating their containers as dates", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(
      `CREATE TABLE nested_dates AS SELECT [DATE '2025-01-01', NULL] AS dates`,
    );
    const table = sdb.newTable("nested_dates");
    assertEquals(await table.getData(), [{ dates: ["2025-01-01", null] }]);
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    await table.log({ types: true });
    assertEquals(lines.join("\n").includes('["2025-01-01",null]'), true);
    assertEquals(lines.join("\n").includes("DATE[]/object"), true);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});
