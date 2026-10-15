import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should chain sync builder methods, with a single await at the observation point", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("chained");

  const data = await table
    .loadArray([
      { name: "b", value: 2 },
      { name: "c", value: 3 },
      { name: "a", value: 1 },
    ])
    .filter(`value > 1`)
    .addColumn("double", "number", `value * 2`)
    .getData();

  expect(data).toStrictEqual([
    { name: "b", value: 2, double: 4 },
    { name: "c", value: 3, double: 6 },
  ]);

  await sdb.close();
});

test("should chain async mutation methods with then", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("chainedAsync");

  const data = await table
    .loadArray([
      { name: "b", value: 2 },
      { name: "c", value: 3 },
      { name: "a", value: 1 },
    ])
    .renameColumns({ value: "amount" })
    .sort({ name: "asc" })
    .renameTable("chainedAsyncRenamed")
    .then((t) => t.getData());

  expect(data).toStrictEqual([
    { name: "a", amount: 1 },
    { name: "b", amount: 2 },
    { name: "c", amount: 3 },
  ]);

  await sdb.close();
});

test("should return the same table instance from mutation methods", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("sameInstance");
  const returned = table.loadArray([{ key1: 1 }]);
  expect(returned === table).toStrictEqual(true);
  const returnedFromRun = await table.run();
  expect(returnedFromRun === table).toStrictEqual(true);
  await sdb.close();
});
