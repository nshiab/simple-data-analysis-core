import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should throw when the source column does not exist", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ name: "Shiab, Nael" }, { name: "Bruce, Graeme" }]);

  table.splitExtract("nope", ",", 0, "lastName");

  await assertRejects(() => table.getData());

  await sdb.close();
});

test("should extract a substring based on a separator and substring", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ name: "Shiab, Nael" }, { name: "Bruce, Graeme" }]);

  table.splitExtract("name", ",", 0, "lastName");

  const data = await table.getData();

  expect(data).toStrictEqual([
    { name: "Shiab, Nael", lastName: "Shiab" },
    {
      name: "Bruce, Graeme",
      lastName: "Bruce",
    },
  ]);
  await sdb.close();
});
test("should extract a substring based on a separator and substring, and overwrite the original column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ name: "Shiab, Nael" }, { name: "Bruce, Graeme" }]);

  table.splitExtract("name", ",", 0, "name");

  const data = await table.getData();

  expect(data).toStrictEqual([{ name: "Shiab" }, { name: "Bruce" }]);
  await sdb.close();
});

test("should bind an extraction separator containing an apostrophe", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("boundSplitExtract");

  table.loadArray([{ value: "rock'n'roll" }]);
  table.splitExtract("value", "'n'", 1, "part");

  expect(await table.getData()).toStrictEqual([{ value: "rock'n'roll", part: "roll" }]);
  await sdb.close();
});
