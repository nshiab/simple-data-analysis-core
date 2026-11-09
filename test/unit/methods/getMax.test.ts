import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the max value", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  expect(await table.getMax("key1")).toStrictEqual(4);
  await sdb.close();
});
test("should return the max value even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key1: "key 1" });
  expect(await table.getMax("key 1")).toStrictEqual(4);
  await sdb.close();
});
test("should return the max value with Dates", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { key1: new Date("2020-01-01") },
    { key1: new Date("2021-01-01") },
    { key1: new Date("2022-01-01") },
    { key1: new Date("2023-01-01") },
  ]);
  expect(await table.getMax("key1")).toStrictEqual(new Date("2023-01-01"));
  await sdb.close();
});

test("getMax rounds fractional extrema and preserves temporal, string, and exact integer values", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { "unit price": 1.234, created: new Date("2020-01-01"), label: "a" },
      { "unit price": 2.345, created: new Date("2021-01-01"), label: "z" },
    ]);
    expect(await table.getMax("UNIT PRICE", { decimals: 2 })).toBe(2.35);
    expect(await table.getMax("unit price", { decimals: 0 })).toBe(2);
    expect(await table.getMax("created", { decimals: 2 })).toEqual(new Date("2021-01-01"));
    expect(await table.getMax("label", { decimals: 2 })).toBe("z");
    await sdb.customQuery(
      "CREATE TABLE exact_value AS SELECT 123456789012345678901234567890123456789::BIGNUM AS value",
    );
    expect(await sdb.newTable("exact_value").getMax("value", { decimals: 2 })).toBe(
      "123456789012345678901234567890123456789",
    );
    await expect(table.getMax("unit price", { decimals: NaN })).rejects.toThrow(
      /options\.decimals/,
    );
  } finally {
    await sdb.close();
  }
});
