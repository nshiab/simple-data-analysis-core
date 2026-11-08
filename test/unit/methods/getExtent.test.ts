import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the extent in [min, max] order", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  expect(await table.getExtent("key1")).toStrictEqual([1, 4]);
  await sdb.close();
});

test("getExtent forwards rounding to both extrema and preserves dates", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      { value: 1.234, date: new Date("2020-01-01") },
      { value: 2.345, date: new Date("2021-01-01") },
    ]);
    expect(await table.getExtent("value", { decimals: 2 })).toEqual([1.23, 2.35]);
    expect(await table.getExtent("value", { decimals: 0 })).toEqual([1, 2]);
    expect(await table.getExtent("date", { decimals: 2 })).toEqual([
      new Date("2020-01-01"),
      new Date("2021-01-01"),
    ]);
  } finally {
    await sdb.close();
  }
});
