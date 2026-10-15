import { test, expect } from "vite-plus/test";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should reject an empty newColumns array at call time", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");

  assertThrows(
    () => table.splitSpread("value", ",", []),
    Error,
    "splitSpread() newColumns must contain at least one column.",
  );

  await sdb.close();
});

test("should split and spread a string into multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ name: "Shiab, Nael" }, { name: "Bruce, Graeme" }]);

  table.splitSpread("name", ",", ["lastName", "firstName"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    { name: "Shiab, Nael", lastName: "Shiab", firstName: " Nael" },
    { name: "Bruce, Graeme", lastName: "Bruce", firstName: " Graeme" },
  ]);
  await sdb.close();
});

test("should split and spread into three columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { address: "123 Main St,Anytown,USA" },
    { address: "456 Oak Ave,Springfield,Canada" },
  ]);

  table.splitSpread("address", ",", ["street", "city", "country"]);

  const data = await table.getData();

  expect(data).toStrictEqual([
    {
      address: "123 Main St,Anytown,USA",
      street: "123 Main St",
      city: "Anytown",
      country: "USA",
    },
    {
      address: "456 Oak Ave,Springfield,Canada",
      street: "456 Oak Ave",
      city: "Springfield",
      country: "Canada",
    },
  ]);
  await sdb.close();
});

test("should handle rows with fewer parts than expected", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ data: "A,B,C" }, { data: "D,E" }, { data: "F" }]);

  // Capture console.warn
  const originalWarn = console.warn;
  let warnMessage = "";
  console.warn = (msg: string) => {
    warnMessage = msg;
  };

  // splitSpread() queues the operation; run() executes it.
  await table.splitSpread("data", ",", ["part1", "part2", "part3"]).run();

  // Restore console.warn
  console.warn = originalWarn;

  expect(warnMessage).toStrictEqual(
    "splitSpread() warning: Some rows contain fewer values after splitting (1) than the number of new columns (3). Empty strings will be used for missing values.",
  );

  const data = await table.getData();

  expect(data).toStrictEqual([
    { data: "A,B,C", part1: "A", part2: "B", part3: "C" },
    { data: "D,E", part1: "D", part2: "E", part3: "" },
    { data: "F", part1: "F", part2: "", part3: "" },
  ]);
  await sdb.close();
});

test("should throw error when rows have more parts than expected", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ data: "A,B,C,D,E" }, { data: "F,G,H" }, { data: "I,J,K,L" }]);

  let errorThrown = false;
  let errorMessage = "";
  try {
    // splitSpread() queues the operation; run() executes it.
    await table.splitSpread("data", ",", ["first", "second"]).run();
  } catch (error) {
    errorThrown = true;
    errorMessage = (error as Error).message;
  }

  expect(errorThrown).toStrictEqual(true);
  // Check that the error message contains the expected information
  expect(
    errorMessage.includes(
      "Some rows contain more values after splitting (5) than the number of new columns specified (2)",
    ),
  ).toStrictEqual(true);
  expect(errorMessage.includes("First 5 rows with too many values:")).toStrictEqual(true);
  expect(errorMessage.includes("A,B,C,D,E")).toStrictEqual(true);
  expect(errorMessage.includes("F,G,H")).toStrictEqual(true);
  expect(errorMessage.includes("I,J,K,L")).toStrictEqual(true);

  await sdb.close();
});

test("should skip validation with strict: false when rows have more parts than expected", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ data: "A,B,C,D,E" }, { data: "F,G,H" }, { data: "I,J,K,L" }]);

  // This should not throw an error because strict is false
  table.splitSpread("data", ",", ["first", "second"], { strict: false });

  const data = await table.getData();

  // Only the first two parts should be extracted
  expect(data).toStrictEqual([
    { data: "A,B,C,D,E", first: "A", second: "B" },
    { data: "F,G,H", first: "F", second: "G" },
    { data: "I,J,K,L", first: "I", second: "J" },
  ]);

  await sdb.close();
});

test("should throw when a new column name already exists, instead of silently renaming it", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ name: "Shiab, Nael", lastName: "already here" }]);

  await assertRejects(
    () => table.splitSpread("name", ",", ["lastName", "firstName"]).run(),
    Error,
    'the column "lastName" already exists',
  );

  await sdb.close();
});

test("should bind a spread separator containing an apostrophe", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("boundSplitSpread");

  table.loadArray([{ value: "rock'n'roll" }]);
  table.splitSpread("value", "'n'", ["first", "second"]);

  expect(await table.getData()).toStrictEqual([
    {
      value: "rock'n'roll",
      first: "rock",
      second: "roll",
    },
  ]);
  await sdb.close();
});
