import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should truncate strings in one column to specified length", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ description: "This is a long description" }]);

  table.truncate("description", 10);

  const data = await table.getData();

  expect(data).toStrictEqual([{ description: "This is a " }]);
  await sdb.close();
});

test("should truncate strings shorter than specified length unchanged", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ name: "John" }]);

  table.truncate("name", 10);

  const data = await table.getData();

  expect(data).toStrictEqual([{ name: "John" }]);
  await sdb.close();
});

test("should truncate strings to zero characters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ text: "Hello World" }]);

  table.truncate("text", 0);

  const data = await table.getData();

  expect(data).toStrictEqual([{ text: "" }]);
  await sdb.close();
});

test("should truncate multiple rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { firstName: "Alexander", lastName: "Washington" },
    { firstName: "Elizabeth", lastName: "Montgomery" },
    { firstName: "Christopher", lastName: "Anderson" },
  ]);

  table.truncate("firstName", 5);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { firstName: "Alexa", lastName: "Washington" },
    { firstName: "Eliza", lastName: "Montgomery" },
    { firstName: "Chris", lastName: "Anderson" },
  ]);
  await sdb.close();
});

test("should truncate strings in column with spaces in name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ "full name": "Alexander Washington" }]);

  table.truncate("full name", 9);

  const data = await table.getData();

  expect(data).toStrictEqual([{ "full name": "Alexander" }]);
  await sdb.close();
});
