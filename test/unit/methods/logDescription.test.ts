import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should log a description of the table with logData", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");

  const logs: string[] = [];
  let consoleTableCalls = 0;
  const originalLog = console.log;
  const originalTable = console.table;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));
  console.table = () => consoleTableCalls++;

  try {
    await table.logDescription();
  } finally {
    console.log = originalLog;
    console.table = originalTable;
    await sdb.close();
  }

  const output = logs.join("\n");
  expect(consoleTableCalls).toStrictEqual(0);
  expect(output.includes("┌")).toStrictEqual(true);
  expect(output.includes("column")).toStrictEqual(true);
  expect(output.includes("unique")).toStrictEqual(true);
});

test("should not throw an error when there is no table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.logDescription();

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});

test("should log a description of the table containing dates", async () => {
  const sdb = new SimpleDB();
  const temperatures = sdb.newTable("temperatures");
  temperatures.loadData("test/data/files/dailyTemperatures.csv");
  await temperatures.logDescription();

  // How to test?
  expect(true).toStrictEqual(true);
  await sdb.close();
});
