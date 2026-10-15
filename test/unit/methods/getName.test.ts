import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

test("should return the name of the table before loading data", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("employees");

  const tableName = table.getName();

  expect(tableName).toStrictEqual("employees");
  expect(table.name).toStrictEqual("employees");
  expect(Object.getOwnPropertyDescriptor(SimpleTable.prototype, "name")).toHaveProperty(
    "set",
    undefined,
  );
  await sdb.close();
});
test("should return the name of the table after loading data", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/data.csv");
  const tableName = table.getName();

  expect(tableName).toStrictEqual("data");
  await table.run();
  await sdb.close();
});
test("should return the updated name after renaming the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("oldName");
  table.loadData("test/data/files/data.csv");

  await table.renameTable("newName");
  const tableName = table.getName();

  expect(tableName).toStrictEqual("newName");
  await sdb.close();
});
