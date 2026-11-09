import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the min value", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  expect(await table.getMin("key1")).toStrictEqual(1);
  await sdb.close();
});
test("should return the min value even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.json");
  table.renameColumns({ key1: "key 1" });
  expect(await table.getMin("key 1")).toStrictEqual(1);
  await sdb.close();
});
test("should return the min value with Dates", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { key1: new Date("2020-01-01") },
    { key1: new Date("2021-01-01") },
    { key1: new Date("2022-01-01") },
    { key1: new Date("2023-01-01") },
  ]);
  expect(await table.getMin("key1")).toStrictEqual(new Date("2020-01-01"));
  await sdb.close();
});

test("getMin rounds fractional extrema and preserves temporal, string, and exact integer values", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { "unit price": 1.234, created: new Date("2020-01-01"), label: "a" },
      { "unit price": 2.345, created: new Date("2021-01-01"), label: "z" },
    ]);
    expect(await table.getMin("UNIT PRICE", { decimals: 2 })).toBe(1.23);
    expect(await table.getMin("unit price", { decimals: 0 })).toBe(1);
    expect(await table.getMin("created", { decimals: 2 })).toEqual(new Date("2020-01-01"));
    expect(await table.getMin("label", { decimals: 2 })).toBe("a");
    await sdb.customQuery(
      "CREATE TABLE exact_value AS SELECT 123456789012345678901234567890123456789::BIGNUM AS value",
    );
    expect(await sdb.newTable("exact_value").getMin("value", { decimals: 2 })).toBe(
      "123456789012345678901234567890123456789",
    );
    await expect(table.getMin("unit price", { decimals: NaN })).rejects.toThrow(
      /options\.decimals/,
    );
  } finally {
    await sdb.close();
  }
});
