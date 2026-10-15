import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should rename a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData(["test/data/files/cities.csv"]);
  await table.renameTable("canadianCities");

  const tables = await sdb.getTableNames();

  expect(tables).toStrictEqual(["canadianCities"]);
  await sdb.close();
});

test("rename rejects a case-insensitive collision with an unmaterialized table", async () => {
  const sdb = new SimpleDB();
  try {
    const reserved = sdb.newTable("reservedName");
    const source = sdb.newTable("renameSource").loadArray([{ value: 1 }]);
    await assertRejects(() => source.renameTable("RESERVEDNAME"), Error, "already exists");
    expect(source.name).toStrictEqual("renameSource");
    expect(sdb.getTables()).toStrictEqual([reserved, source]);
    expect(await source.getData()).toStrictEqual([{ value: 1 }]);
    expect(await sdb.getTableNames()).toStrictEqual([source.name]);
  } finally {
    await sdb.close();
  }
});
