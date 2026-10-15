import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the total number of characters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  // key2 values: "un" (2), "deux" (4), "trois" (5), "quatre" (6)
  // Total: 2 + 4 + 5 + 6 = 17
  expect(await table.getCharacterCount("key2")).toStrictEqual(17);
  await sdb.close();
});

test("should return the total number of characters even when there are spaces in the column name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData(["test/data/files/data.json"]);
  table.renameColumns({ key2: "key 2" });
  // key2 values: "un" (2), "deux" (4), "trois" (5), "quatre" (6)
  // Total: 2 + 4 + 5 + 6 = 17
  expect(await table.getCharacterCount("key 2")).toStrictEqual(17);
  await sdb.close();
});
