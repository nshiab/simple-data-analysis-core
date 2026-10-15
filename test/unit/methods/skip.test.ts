import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should skip rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb
    .newTable()
    .loadArray([{ first: "Nael" }, { first: "Graeme" }, { first: "Andrew" }]);
  table.skip(1);
  const data = await table.getData();
  expect(data).toStrictEqual([{ first: "Graeme" }, { first: "Andrew" }]);
  await sdb.close();
});
