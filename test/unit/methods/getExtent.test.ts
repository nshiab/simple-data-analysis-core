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

test("getExtent captures both bounds and precision before a later table change", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("exact_extent");
    await sdb.customQuery(`CREATE TABLE exact_extent AS SELECT v::DECIMAL(25,3) AS value FROM
      (VALUES ('12345678901234567890.123'), ('12345678901234567890.678')) t(v)`);
    expect((await table.getTypes()).value).toBe("DECIMAL(25,3)");
    const options = { decimals: 2 };
    const extent = table.getExtent("value", options);
    options.decimals = 0;
    table.convert({ value: "string" });

    expect(await extent).toEqual(["12345678901234567890.12", "12345678901234567890.68"]);
    expect((await table.getTypes()).value).toBe("VARCHAR");
  } finally {
    await sdb.close();
  }
});
