import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the sum", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  expect(await table.getSum("key1")).toStrictEqual(10);
  await sdb.close();
});
test("should return the sum even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key1: "key 1" });
  expect(await table.getSum("key 1")).toStrictEqual(10);
  await sdb.close();
});

test("should round the completed sum to the requested decimal places", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sales");
  table.loadArray([{ "sale amount": 0.264 }, { "sale amount": 0.264 }]);

  expect(await table.getSum("sale amount", { decimals: 2 })).toStrictEqual(0.53);
  expect(await table.getSum("sale amount", { decimals: 0 })).toStrictEqual(1);
  await expect(table.getSum("sale amount", { decimals: -1 })).rejects.toThrow(/options\.decimals/);

  await sdb.close();
});

test("getSum preserves an exact BIGNUM sum when decimals is set", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("exact_sum");
  await sdb.customQuery(`CREATE TABLE exact_sum AS
    SELECT v::BIGNUM AS amount FROM (VALUES ('123456789012345678901234567890123456789'), ('1')) t(v)`);

  expect(await table.getSum("amount", { decimals: 2 })).toBe(
    "123456789012345678901234567890123456790",
  );

  await sdb.close();
});
