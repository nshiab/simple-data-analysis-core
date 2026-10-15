import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should capitalize strings in one column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ firstName: "NAEL", lastName: "SHIAB" }]);

  table.capitalize("firstName");

  const data = await table.getData();

  expect(data).toStrictEqual([{ firstName: "Nael", lastName: "SHIAB" }]);
  await sdb.close();
});

test("should capitalize strings in two columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ firstName: "NAEL", lastName: "SHIAB" }]);

  table.capitalize(["firstName", "lastName"]);

  const data = await table.getData();

  expect(data).toStrictEqual([{ firstName: "Nael", lastName: "Shiab" }]);
  await sdb.close();
});

test("should capitalize strings in two columns with column names containing spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ "first Name": "NAEL", "last Name": "SHIAB" }]);

  table.capitalize(["first Name", "last Name"]);

  const data = await table.getData();

  expect(data).toStrictEqual([{ "first Name": "Nael", "last Name": "Shiab" }]);
  await sdb.close();
});
