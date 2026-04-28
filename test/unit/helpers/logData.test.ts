import { assertEquals } from "@std/assert";
import logData from "../../../src/helpers/logData.ts";

// Capture console.log output to verify the function works without crashing.

Deno.test("logData - null data logs null message", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  logData(null, null);

  console.log = originalLog;

  assertEquals(logs, ["Data is null"]);
});

Deno.test("logData - empty array logs the array", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  logData(null, []);

  console.log = originalLog;

  assertEquals(logs, [""]);
});

Deno.test("logData - basic table renders without error", () => {
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
  assertEquals(logs.length, 6);

  const allOutput = logs.join("\n");
  assertEquals(allOutput.includes("┌"), true);
  assertEquals(allOutput.includes("└"), true);
});

Deno.test("logData - types parameter adds types row in grey", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const types = { name: "VARCHAR", age: "INTEGER" };
  const data = [{ name: "Alice", age: 30 }];
  logData(types, data);

  console.log = originalLog;

  // Should have: top | header | types | sep | data | bottom = 6 lines
  // (separator after types row, not after header since typesRowIndex is 0)
  assertEquals(logs.length, 6);
  // The separator (├) should be at index 3 (after types row at index 2)
  assertEquals(logs[3].includes("├"), true);
  // Types row should contain the type annotations with type suffixes
  assertEquals(logs[2].includes("VARCHAR/string"), true);
  assertEquals(logs[2].includes("INTEGER/number"), true);
});

Deno.test("logData - nbCharactersToLog truncates strings and sets maxColumnWidth", () => {
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
  assertEquals(logs.length > 4, true);
  // The description should be truncated
  const allOutput = logs.join("\n");
  assertEquals(allOutput.includes("..."), true);
});

Deno.test("logData - combines types and nbCharactersToLog", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const types = { name: "VARCHAR", age: "INTEGER" };
  const data = [{ name: "Alice", age: 30 }];
  logData(types, data, 15);

  console.log = originalLog;

  // Should have: top | header | types | sep | data | bottom = 6 lines
  assertEquals(logs.length, 6);
  // Types row should be at index 2 with type suffixes
  assertEquals(logs[2].includes("VARCHAR/string"), true);
  assertEquals(logs[2].includes("INTEGER/number"), true);
  // Separator should be after types row
  assertEquals(logs[3].includes("├"), true);
});

Deno.test("logData - handles null values in data", () => {
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
  assertEquals(logs.length >= 4, true);
  const allOutput = logs.join("\n");
  assertEquals(allOutput.includes("null"), true);
});

Deno.test("logData - Date objects are formatted as ISO strings", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [{ name: "Alice", birthday: new Date("1993-01-01") }];
  logData(null, data);

  console.log = originalLog;

  const isoString = "1993-01-01T00:00:00.000Z";
  const found = logs.some((log) => log.includes(isoString));
  assertEquals(found, true);
});

Deno.test("logData - ANSI color codes are present in output", () => {
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
  assertEquals(allOutput.includes("\x1b["), true);
});
