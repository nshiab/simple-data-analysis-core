import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the first two strings", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { firstName: "Nael", lastName: "Shiab" },
    { firstName: "Graeme", lastName: "Bruce" },
  ]);

  table.firstChars("firstName", 2);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { firstName: "Na", lastName: "Shiab" },
    { firstName: "Gr", lastName: "Bruce" },
  ]);

  await sdb.close();
});
