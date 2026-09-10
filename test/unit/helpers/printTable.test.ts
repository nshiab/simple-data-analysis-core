import { assertEquals } from "@std/assert";
import printTable from "../../../src/helpers/printTable.ts";

// Capture console output to check rendering and layout.

Deno.test("printTable - empty data shows message", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));

  printTable([]);
  printTable([] as { [key: string]: unknown }[]);

  console.log = originalLog;

  assertEquals(logs, ["(empty table)", "(empty table)"]);
});

Deno.test("printTable - basic table renders without error", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ];
  printTable(data);

  console.log = originalLog;

  // Should have top border, header, separator, rows, bottom border
  // Without word wrapping: top | header | sep | row1 | row2 | bottom = 6 lines
  assertEquals(logs.length, 6);

  const allOutput = logs.join("\n");
  // Check box-drawing characters exist
  assertEquals(allOutput.includes("┌"), true);
  assertEquals(allOutput.includes("└"), true);
});

Deno.test("printTable - word wrapping with maxColumnWidth", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [
    {
      name: "Alice",
      description: "A very long description that should be wrapped",
    },
  ];
  printTable(data, { maxColumnWidth: 20 });

  console.log = originalLog;

  // Should have more than 4 lines due to wrapping
  assertEquals(logs.length > 4, true);
});

Deno.test("printTable - minColumnWidth enforcement", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [{ a: "x" }];
  printTable(data, { minColumnWidth: 10 });

  console.log = originalLog;

  // Should have: top | header | sep | bottom = 4 lines (no data row with single char)
  // Actually: top | header | sep | data | bottom = 5 lines
  assertEquals(logs.length, 5);
});

Deno.test("printTable - types row rendered in grey", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const types = { name: "VARCHAR/string", age: "INTEGER/number" };
  const data = [{ name: "Alice", age: 30 }];
  printTable([types, ...data], { typesRowIndex: 0 });

  console.log = originalLog;

  // Should have: top | header | types | sep | data | bottom = 6 lines
  // (separator after types row, not after header since typesRowIndex is 0)
  assertEquals(logs.length, 6);
  // The separator (├) should be at index 3 (after types row at index 2)
  assertEquals(logs[3].includes("├"), true);
});

Deno.test("printTable - Date objects formatted as ISO strings", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [{ name: "Alice", birthday: new Date("1993-01-01") }];
  printTable(data);

  console.log = originalLog;

  // The ISO string should appear in the output
  const isoString = "1993-01-01T00:00:00.000Z";
  const found = logs.some((log) => log.includes(isoString));
  assertEquals(found, true);
});

Deno.test("printTable - ANSI color codes for different types", () => {
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
  printTable(data);

  console.log = originalLog;

  // All ANSI codes should be present in the output
  const allOutput = logs.join("\n");
  // The output should contain ANSI escape sequences
  assertEquals(allOutput.includes("\x1b["), true);
});

Deno.test("printTable - box-drawing characters", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  // Use 2 columns to ensure junction characters are present
  const data = [{ a: "1", b: "2" }];
  printTable(data);

  console.log = originalLog;

  const allOutput = logs.join("\n");
  assertEquals(allOutput.includes("┌"), true); // top-left
  assertEquals(allOutput.includes("┐"), true); // top-right
  assertEquals(allOutput.includes("└"), true); // bottom-left
  assertEquals(allOutput.includes("┘"), true); // bottom-right
  assertEquals(allOutput.includes("├"), true); // junction
  assertEquals(allOutput.includes("┤"), true); // junction
  assertEquals(allOutput.includes("┬"), true); // junction
  assertEquals(allOutput.includes("┴"), true); // junction
  assertEquals(allOutput.includes("┼"), true); // junction
  assertEquals(allOutput.includes("│"), true); // vertical bar
  assertEquals(allOutput.includes("─"), true); // horizontal bar
});

function captureTable(
  data: { [key: string]: unknown }[],
  options?: Parameters<typeof printTable>[1],
): string[] {
  const logs: string[] = [];
  const originalLog = console.log;
  try {
    console.log = (...args: unknown[]) => logs.push(String(args[0]));
    printTable(data, options);
  } finally {
    console.log = originalLog;
  }
  // Strip the renderer's ANSI colors before checking the table layout.
  // deno-lint-ignore no-control-regex
  return logs.map((line) => line.replace(/\x1b\[[0-9;]*m/g, ""));
}

Deno.test("printTable - long headers wrap at the default ceiling with aligned columns", () => {
  const header = "x".repeat(80);
  const logs = captureTable([{ [header]: "value", id: 1 }]);
  assertEquals(logs, [
    `┌${"─".repeat(77)}┬─────┐`,
    `│ ${"x".repeat(75)} │ id  │`,
    `│ xxxxx${" ".repeat(71)}│     │`,
    `├${"─".repeat(77)}┼─────┤`,
    `│ value${" ".repeat(71)}│ 1   │`,
    `└${"─".repeat(77)}┴─────┘`,
  ]);
});

Deno.test("printTable - multiline headers size by their longest line and preserve blank lines", () => {
  const logs = captureTable([{ "a\n\nbb\n": "x", id: 1 }]);
  assertEquals(logs, [
    "┌─────┬─────┐",
    "│ a   │ id  │",
    "│     │     │",
    "│ bb  │     │",
    "│     │     │",
    "├─────┼─────┤",
    "│ x   │ 1   │",
    "└─────┴─────┘",
  ]);
});

Deno.test("printTable - headers and cells share word wrapping and align with wrapped types", () => {
  const header = "first second\nabcdefghijk";
  const logs = captureTable([
    { [header]: "VARCHAR/string", id: "INTEGER/number" },
    { [header]: header, id: 1 },
  ], { maxColumnWidth: 10, typesRowIndex: 0 });
  assertEquals(logs, [
    "┌────────────┬────────────┐",
    "│ first      │ id         │",
    "│ second     │            │",
    "│ abcdefghij │            │",
    "│ k          │            │",
    "│ VARCHAR/st │ INTEGER/nu │",
    "│ ring       │ mber       │",
    "├────────────┼────────────┤",
    "│ first      │ 1          │",
    "│ second     │            │",
    "│ abcdefghij │            │",
    "│ k          │            │",
    "└────────────┴────────────┘",
  ]);
});
