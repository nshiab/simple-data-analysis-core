import { test, expect, expectTypeOf } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the unique values of a column", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("data").loadData("test/data/files/dataDuplicates.csv");
    const uniques = await table.getUniques("key1");

    expectTypeOf(uniques).toEqualTypeOf<unknown[]>();
    expect(uniques).toStrictEqual(["1", "3", "8", "brioche"]);
  } finally {
    await sdb.close();
  }
});

test("should return unique combinations sorted by the supplied column order", async () => {
  const sdb = new SimpleDB();
  try {
    const data = [
      { yearStart: 2021, yearEnd: 2022, label: "first" },
      { yearStart: 2020, yearEnd: 2023, label: "second" },
      { yearStart: 2020, yearEnd: 2021, label: "third" },
      { yearStart: 2020, yearEnd: 2021, label: "duplicate pair" },
    ];
    const table = sdb.newTable("years").loadArray(data);
    const columns = ["yearStart", "yearEnd"];
    const uniques = await table.getUniques(columns);

    expectTypeOf(uniques).toEqualTypeOf<{ [key: string]: unknown }[]>();
    expect(uniques).toStrictEqual([
      { yearStart: 2020, yearEnd: 2021 },
      { yearStart: 2020, yearEnd: 2023 },
      { yearStart: 2021, yearEnd: 2022 },
    ]);
    const reversed = await table.getUniques(["yearEnd", "yearStart"]);
    expect(reversed).toStrictEqual([
      { yearEnd: 2021, yearStart: 2020 },
      { yearEnd: 2022, yearStart: 2021 },
      { yearEnd: 2023, yearStart: 2020 },
    ]);
    expect(Object.keys(reversed[0])).toStrictEqual(["yearEnd", "yearStart"]);
    expect(columns).toStrictEqual(["yearStart", "yearEnd"]);
    expect(await table.getData()).toStrictEqual(data);
  } finally {
    await sdb.close();
  }
});

test("should return row objects for a one-column array and ignore repeated columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 2 }, { value: 1 }, { value: 2 }]);
    expect(await table.getUniques(["value"])).toStrictEqual([{ value: 1 }, { value: 2 }]);
    expect(await table.getUniques(["value", "value"])).toStrictEqual([{ value: 1 }, { value: 2 }]);
    const getUniques = (column: string | string[]) => table.getUniques(column);
    expectTypeOf(getUniques).returns.toEqualTypeOf<Promise<unknown[]>>();
  } finally {
    await sdb.close();
  }
});

test("should quote identifiers and retain null and temporal values in unique combinations", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE "year ""ranges" AS SELECT * FROM (VALUES
      (DATE '2021-01-01', 2022),
      (NULL, 2022),
      (DATE '2020-01-01', NULL),
      (DATE '2020-01-01', NULL),
      (DATE '2020-01-01', 2021)
    ) AS t("start year", "end""year")`);
    const table = sdb.newTable('year "ranges');
    const first = new Date("2020-01-01T00:00:00.000Z");
    const second = new Date("2021-01-01T00:00:00.000Z");
    expect(await table.getUniques(["start year", 'end"year'])).toStrictEqual([
      { "start year": first, 'end"year': 2021 },
      { "start year": first, 'end"year': null },
      { "start year": second, 'end"year': 2022 },
      { "start year": null, 'end"year': 2022 },
    ]);
  } finally {
    await sdb.close();
  }
});

test("should return empty results for a table with no rows", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable("empty")
      .loadArray([{ first: 1, second: 2 }])
      .filter("false");
    expect(await table.getUniques("first")).toStrictEqual([]);
    expect(await table.getUniques(["first", "second"])).toStrictEqual([]);
  } finally {
    await sdb.close();
  }
});

test("should reject empty column arrays and missing columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("data").loadArray([{ value: 1 }]);
    await expect(table.getUniques([])).rejects.toThrow(
      "getUniques() requires at least one column.",
    );
    await expect(table.getUniques(["value", "data"])).rejects.toThrow(
      "does not have a column named",
    );
  } finally {
    await sdb.close();
  }
});
