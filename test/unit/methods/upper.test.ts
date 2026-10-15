import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should uppercase strings in one column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ firstName: "nael", lastName: "shiab" }]);

  table.upper("firstName");

  const data = await table.getData();

  expect(data).toStrictEqual([{ firstName: "NAEL", lastName: "shiab" }]);
  await sdb.close();
});

test("should uppercase strings in two columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ firstName: "nael", lastName: "shiab" }]);

  table.upper(["firstName", "lastName"]);

  const data = await table.getData();

  expect(data).toStrictEqual([{ firstName: "NAEL", lastName: "SHIAB" }]);
  await sdb.close();
});

test("should uppercase strings in two columns with column names containing spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ "first Name": "nael", "last Name": "shiab" }]);

  table.upper(["first Name", "last Name"]);

  const data = await table.getData();

  expect(data).toStrictEqual([{ "first Name": "NAEL", "last Name": "SHIAB" }]);
  await sdb.close();
});
