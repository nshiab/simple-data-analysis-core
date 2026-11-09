import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("wider leaves the connection usable after a failed pivot", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("failedPivot");
    await table.loadArray([{ category: "a", value: 1 }]).run();

    // Dynamic PIVOT inside CREATE TABLE opens an implicit DuckDB transaction.
    // A binding failure must not leave that transaction blocking later queries.
    await assertRejects(
      () => table.wider("category", "missing_value").run(),
      Error,
      "missing_value",
    );
    expect(await sdb.customQuery("SELECT 42 AS answer", { returnData: true })).toStrictEqual([
      { answer: 42 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("should untidy data by expanding mutiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/dataTidy.json");
  table.wider("year", "employees");

  table.sort({ Department: "asc" });
  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      "2015": 1,
      "2016": 2,
      "2017": 5,
      "2018": 2,
      "2019": 2,
      "2020": 3,
      Department: "R&D",
    },
    {
      "2015": 10,
      "2016": 9,
      "2017": 15,
      "2018": 11,
      "2019": 25,
      "2020": 32,
      Department: "accounting",
    },
    {
      "2015": 2,
      "2016": 7,
      "2017": 15,
      "2018": 32,
      "2019": 45,
      "2020": 27,
      Department: "sales",
    },
  ]);

  await sdb.close();
});

test("should untidy data by expanding mutiple columns with spaces in their names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      Department: "accounting",
      "approximate year": "2015",
      "employees full-time": 10,
    },
    {
      Department: "accounting",
      "approximate year": "2016",
      "employees full-time": 9,
    },
    {
      Department: "accounting",
      "approximate year": "2017",
      "employees full-time": 15,
    },
    {
      Department: "accounting",
      "approximate year": "2018",
      "employees full-time": 11,
    },
    {
      Department: "accounting",
      "approximate year": "2019",
      "employees full-time": 25,
    },
    {
      Department: "accounting",
      "approximate year": "2020",
      "employees full-time": 32,
    },
    {
      Department: "R&D",
      "approximate year": "2015",
      "employees full-time": 1,
    },
    {
      Department: "R&D",
      "approximate year": "2016",
      "employees full-time": 2,
    },
    {
      Department: "R&D",
      "approximate year": "2017",
      "employees full-time": 5,
    },
    {
      Department: "R&D",
      "approximate year": "2018",
      "employees full-time": 2,
    },
    {
      Department: "R&D",
      "approximate year": "2019",
      "employees full-time": 2,
    },
    {
      Department: "R&D",
      "approximate year": "2020",
      "employees full-time": 3,
    },
    {
      Department: "sales",
      "approximate year": "2015",
      "employees full-time": 2,
    },
    {
      Department: "sales",
      "approximate year": "2016",
      "employees full-time": 7,
    },
    {
      Department: "sales",
      "approximate year": "2017",
      "employees full-time": 15,
    },
    {
      Department: "sales",
      "approximate year": "2018",
      "employees full-time": 32,
    },
    {
      Department: "sales",
      "approximate year": "2019",
      "employees full-time": 45,
    },
    {
      Department: "sales",
      "approximate year": "2020",
      "employees full-time": 27,
    },
  ]);
  table.wider("approximate year", "employees full-time");

  table.sort({ Department: "asc" });
  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      "2015": 1,
      "2016": 2,
      "2017": 5,
      "2018": 2,
      "2019": 2,
      "2020": 3,
      Department: "R&D",
    },
    {
      "2015": 10,
      "2016": 9,
      "2017": 15,
      "2018": 11,
      "2019": 25,
      "2020": 32,
      Department: "accounting",
    },
    {
      "2015": 2,
      "2016": 7,
      "2017": 15,
      "2018": 32,
      "2019": 45,
      "2020": 27,
      Department: "sales",
    },
  ]);

  await sdb.close();
});

test.each([{}, { decimals: 2 }])(
  "wider requires a stat for duplicate cells (%j)",
  async (options) => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray(
        [
          { Department: "accounting", year: 2015, employees: null },
          { Department: "accounting", year: 2015, employees: null },
          { Department: "sales", year: 2015, employees: 5 },
        ],
        { columnTypes: { year: "integer" } },
      );
      await expect(table.wider("Year", "Employees", options).run()).rejects.toThrow(
        /pivot cell \{"Department":"accounting","year":"2015"\}\. Pass options\.stat.*or remove the duplicate rows/,
      );
    } finally {
      await sdb.close();
    }
  },
);

test("wider preserves text and null cells when stat is omitted", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray(
      [
        { region: "east", year: 2024, name: "Alice" },
        { region: "east", year: 2025, name: null },
        { region: "west", year: 2024, name: "Bob" },
      ],
      { columnTypes: { year: "integer" } },
    );
    expect(await table.wider("year", "name").sort({ region: "asc" }).getData()).toEqual([
      { region: "east", 2024: "Alice", 2025: null },
      { region: "west", 2024: "Bob", 2025: null },
    ]);
  } finally {
    await sdb.close();
  }
});

test("wider sums duplicate values when stat is sum", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { Department: "accounting", year: "2015", employees: 10 },
    { Department: "accounting", year: "2015", employees: 5 },
  ]);
  table.wider("year", "employees", { stat: "sum" });

  const data = await table.getData();

  expect(data).toStrictEqual([{ Department: "accounting", "2015": 15 }]);

  await sdb.close();
});

test("wider averages duplicate values when stat is mean", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { Department: "accounting", year: "2015", employees: 10 },
    { Department: "accounting", year: "2015", employees: 5 },
  ]);
  table.wider("year", "employees", { stat: "mean" });

  const data = await table.getData();

  expect(data).toStrictEqual([{ Department: "accounting", "2015": 7.5 }]);

  await sdb.close();
});

test("wider rounds finished aggregates without rounding grouping columns or counts", async () => {
  const sdb = new SimpleDB();
  try {
    for (const [stat, expected] of [
      ["sum", 0.53],
      ["mean", 0.26],
      ["median", 0.26],
      ["min", 0.26],
      ["max", 0.26],
      ["first", 0.26],
      ["count", 2],
    ] as const) {
      const table = sdb.newTable().loadArray([
        { group: 1.2345, category: 'a"b', value: 0.264 },
        { group: 1.2345, category: 'a"b', value: 0.264 },
      ]);
      expect(
        await table
          .wider("category", "value", { stat, decimals: stat === "count" ? 0 : 2 })
          .getData(),
      ).toEqual([{ group: 1.2345, 'a"b': expected }]);
    }
    const integers = sdb.newTable().loadArray([
      { category: "a", value: 1 },
      { category: "a", value: 2 },
      { category: "a", value: 2 },
    ]);
    expect(
      await integers.wider("category", "value", { stat: "mean", decimals: 2 }).getData(),
    ).toEqual([{ a: 1.67 }]);
    const strings = sdb.newTable().loadArray([{ category: "a", value: "hello" }]);
    expect(
      await strings.wider("category", "value", { stat: "first", decimals: 2 }).getData(),
    ).toEqual([{ a: "hello" }]);
    const dates = sdb.newTable().loadArray([{ category: "a", value: new Date("2020-01-01") }]);
    expect(
      await dates.wider("category", "value", { stat: "median", decimals: 2 }).getData(),
    ).toEqual([{ a: new Date("2020-01-01") }]);
    const whole = sdb.newTable().loadArray([{ category: "a", value: 0.528 }]);
    expect(await whole.wider("category", "value", { decimals: 0 }).getData()).toEqual([{ a: 1 }]);
    const exact = sdb.newTable("exact_pivot");
    await sdb.customQuery(
      "CREATE TABLE exact_pivot AS SELECT * FROM (VALUES ('a', 0.264::DECIMAL(6,3)), ('a', 0.264::DECIMAL(6,3))) t(category,value)",
    );
    expect(await exact.wider("category", "value", { stat: "sum", decimals: 2 }).getData()).toEqual([
      { a: "0.53" },
    ]);
    const invalid = sdb.newTable().loadArray([{ category: "a", value: 1 }]);
    await expect(invalid.wider("category", "value", { decimals: 0.5 }).run()).rejects.toThrow(
      /options\.decimals/,
    );
  } finally {
    await sdb.close();
  }
});

test("wider preserves an exact BIGNUM median when decimals is set", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("exact_median");
    const lower = "12345678901234567890123456789012345678901234567890";
    const upper = "12345678901234567890123456789012345678901234567891";
    await sdb.customQuery(`CREATE TABLE exact_median AS SELECT 'a' AS category, v::BIGNUM AS value
      FROM (VALUES ('${lower}'), ('${upper}')) t(v)`);

    expect(
      await table.wider("category", "value", { stat: "median", decimals: 2 }).getData(),
    ).toEqual([{ a: lower }]);
    expect((await table.getTypes()).a).toBe("BIGNUM");
  } finally {
    await sdb.close();
  }
});
