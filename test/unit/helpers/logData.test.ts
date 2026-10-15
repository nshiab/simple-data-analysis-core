import { test, expect } from "vite-plus/test";

import logData from "../../../src/helpers/logData.ts";

// Capture console.log output to verify the function works without crashing.

test("logData - null data logs null message", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  logData(null, null);

  console.log = originalLog;

  expect(logs).toStrictEqual(["Data is null"]);
});

test("logData - empty array logs the array", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  logData(null, []);

  console.log = originalLog;

  expect(logs).toStrictEqual([""]);
});

test("logData - basic table renders without error", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ];
  logData(null, data);

  console.log = originalLog;

  // Should have top | header | sep | row1 | row2 | bottom = 6 lines
  expect(logs.length).toStrictEqual(6);

  const allOutput = logs.join("\n");
  expect(allOutput.includes("┌")).toStrictEqual(true);
  expect(allOutput.includes("└")).toStrictEqual(true);
});

test("logData - types parameter adds types row in grey", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const types = { name: "VARCHAR", age: "INTEGER" };
  const data = [{ name: "Alice", age: 30 }];
  logData(types, data);

  console.log = originalLog;

  // Should have: top | header | types | sep | data | bottom = 6 lines
  // (separator after types row, not after header since typesRowIndex is 0)
  expect(logs.length).toStrictEqual(6);
  // The separator (├) should be at index 3 (after types row at index 2)
  expect(logs[3].includes("├")).toStrictEqual(true);
  // Types row should contain the type annotations with type suffixes
  expect(logs[2].includes("VARCHAR/string")).toStrictEqual(true);
  expect(logs[2].includes("INTEGER/number")).toStrictEqual(true);
});

test("logData - charsToLog truncates strings", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [
    {
      name: "Alice",
      description: "This is a very long description that should be truncated",
    },
    { name: "Bob", description: "Short" },
  ];
  logData(null, data, 20);

  console.log = originalLog;

  // Should have more than 4 lines due to wrapping
  expect(logs.length > 4).toStrictEqual(true);
  // The description should be truncated
  const allOutput = logs.join("\n");
  expect(allOutput.includes("...")).toStrictEqual(true);
});

test("logData - combines types and charsToLog", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const types = { name: "VARCHAR", age: "INTEGER" };
  const data = [{ name: "Alice", age: 30 }];
  logData(types, data, 15);

  console.log = originalLog;

  // Should have: top | header | types | sep | data | bottom = 6 lines
  expect(logs.length).toStrictEqual(6);
  // Types row should be at index 2 with type suffixes
  expect(logs[2].includes("VARCHAR/string")).toStrictEqual(true);
  expect(logs[2].includes("INTEGER/number")).toStrictEqual(true);
  // Separator should be after types row
  expect(logs[3].includes("├")).toStrictEqual(true);
});

test("logData - handles null values in data", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [
    { name: "Alice", value: null },
    { name: "Bob", value: 123 },
  ];
  logData(null, data);

  console.log = originalLog;

  // Should render without error
  expect(logs.length >= 4).toStrictEqual(true);
  const allOutput = logs.join("\n");
  expect(allOutput.includes("null")).toStrictEqual(true);
});

test("logData - Date objects are formatted as ISO strings", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [{ name: "Alice", birthday: new Date("1993-01-01") }];
  logData(null, data);

  console.log = originalLog;

  const isoString = "1993-01-01T00:00:00.000Z";
  const found = logs.some((log) => log.includes(isoString));
  expect(found).toStrictEqual(true);
});

test("logData - ANSI color codes are present in output", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [
    {
      name: "Alice",
      age: 30,
      isStudent: false,
      birthday: new Date("1993-01-01"),
      salary: null,
    },
  ];
  logData(null, data);

  console.log = originalLog;

  const allOutput = logs.join("\n");
  expect(allOutput.includes("\x1b[")).toStrictEqual(true);
});

test("logData keeps truncation independent of width and does not mutate annotations", () => {
  const originalLog = console.log;
  const lines: string[] = [];
  const types = { value: "VARCHAR" };
  try {
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    logData(types, [{ value: "x".repeat(200) }], 150);
    expect(lines[0].includes("─".repeat(77))).toStrictEqual(true);
    expect(lines[0].includes("─".repeat(78))).toStrictEqual(false);
    expect(types).toStrictEqual({ value: "VARCHAR" });
    expect(lines.join("\n").includes("...")).toStrictEqual(true);
  } finally {
    console.log = originalLog;
  }
});
