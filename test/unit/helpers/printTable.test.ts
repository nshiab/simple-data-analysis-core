import { stripVTControlCharacters } from "node:util";
import { test, expect } from "vite-plus/test";

import printTable from "../../../src/helpers/printTable.ts";

// Capture console output to check rendering and layout.

test("printTable - empty data shows message", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(args.join(" "));

  printTable([]);
  printTable([] as { [key: string]: unknown }[]);

  console.log = originalLog;

  expect(logs).toStrictEqual(["(empty table)", "(empty table)"]);
});

test("printTable - basic table renders without error", () => {
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
  expect(logs.length).toStrictEqual(6);

  const allOutput = logs.join("\n");
  // Check box-drawing characters exist
  expect(allOutput.includes("┌")).toStrictEqual(true);
  expect(allOutput.includes("└")).toStrictEqual(true);
});

test("printTable - word wrapping with maxColumnWidth", () => {
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
  expect(logs.length > 4).toStrictEqual(true);
});

test("printTable - minColumnWidth enforcement", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [{ a: "x" }];
  printTable(data, { minColumnWidth: 10 });

  console.log = originalLog;

  // Should have: top | header | sep | bottom = 4 lines (no data row with single char)
  // Actually: top | header | sep | data | bottom = 5 lines
  expect(logs.length).toStrictEqual(5);
});

test("printTable - types row rendered in grey", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const types = { name: "VARCHAR/string", age: "INTEGER/number" };
  const data = [{ name: "Alice", age: 30 }];
  printTable([types, ...data], { typesRowIndex: 0 });

  console.log = originalLog;

  // Should have: top | header | types | sep | data | bottom = 6 lines
  // (separator after types row, not after header since typesRowIndex is 0)
  expect(logs.length).toStrictEqual(6);
  // The separator (├) should be at index 3 (after types row at index 2)
  expect(logs[3].includes("├")).toStrictEqual(true);
});

test("printTable - Date objects formatted as ISO strings", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  const data = [{ name: "Alice", birthday: new Date("1993-01-01") }];
  printTable(data);

  console.log = originalLog;

  // The ISO string should appear in the output
  const isoString = "1993-01-01T00:00:00.000Z";
  const found = logs.some((log) => log.includes(isoString));
  expect(found).toStrictEqual(true);
});

test("printTable - ANSI color codes for different types", () => {
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
  expect(allOutput.includes("\x1b[")).toStrictEqual(true);
});

test("printTable - box-drawing characters", () => {
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args: unknown[]) => logs.push(String(args[0]));

  // Use 2 columns to ensure junction characters are present
  const data = [{ a: "1", b: "2" }];
  printTable(data);

  console.log = originalLog;

  const allOutput = logs.join("\n");
  expect(allOutput.includes("┌")).toStrictEqual(true); // top-left
  expect(allOutput.includes("┐")).toStrictEqual(true); // top-right
  expect(allOutput.includes("└")).toStrictEqual(true); // bottom-left
  expect(allOutput.includes("┘")).toStrictEqual(true); // bottom-right
  expect(allOutput.includes("├")).toStrictEqual(true); // junction
  expect(allOutput.includes("┤")).toStrictEqual(true); // junction
  expect(allOutput.includes("┬")).toStrictEqual(true); // junction
  expect(allOutput.includes("┴")).toStrictEqual(true); // junction
  expect(allOutput.includes("┼")).toStrictEqual(true); // junction
  expect(allOutput.includes("│")).toStrictEqual(true); // vertical bar
  expect(allOutput.includes("─")).toStrictEqual(true); // horizontal bar
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
  return logs.map(stripVTControlCharacters);
}

test("printTable - decomposed accents preserve filename column alignment", () => {
  const fileName = "006 PLQ_Gue\u0301rette Thomas_QC 2026.png";
  const rows = [
    { fileName: "001 PQ_Tremblay Stephane_QC 2026.png", detected: false },
    { fileName, detected: false },
    { fileName: "Stephanie-Danylko.jpg", detected: true },
    { fileName: "Thunder Bay cand photo.png", detected: true },
  ];
  const logs = captureTable(rows);
  const composed = captureTable(
    rows.map((row) => ({
      ...row,
      fileName: row.fileName.normalize("NFC"),
    })),
  );
  expect(logs.map((line) => line.normalize("NFC"))).toStrictEqual(composed);
  expect(logs.some((line) => line.includes(fileName))).toStrictEqual(true);
  expect(rows[1].fileName).toStrictEqual(fileName);
});

test("printTable - combining accents align in wrapped headers and multiline cells", () => {
  const logs = captureTable(
    [{ "e\u0301e\u0301e\u0301e\u0301": "a\u0301bc\u0301d\n\ne\u0301", id: 1 }],
    { maxColumnWidth: 3 },
  );
  expect(logs).toStrictEqual([
    "┌─────┬─────┐",
    "│ e\u0301e\u0301e\u0301 │ id  │",
    "│ e\u0301   │     │",
    "├─────┼─────┤",
    "│ a\u0301bc\u0301 │ 1   │",
    "│ d   │     │",
    "│     │     │",
    "│ e\u0301   │     │",
    "└─────┴─────┘",
  ]);
});

test("printTable - long headers wrap at the default ceiling with aligned columns", () => {
  const header = "x".repeat(80);
  const logs = captureTable([{ [header]: "value", id: 1 }]);
  expect(logs).toStrictEqual([
    `┌${"─".repeat(77)}┬─────┐`,
    `│ ${"x".repeat(75)} │ id  │`,
    `│ xxxxx${" ".repeat(71)}│     │`,
    `├${"─".repeat(77)}┼─────┤`,
    `│ value${" ".repeat(71)}│ 1   │`,
    `└${"─".repeat(77)}┴─────┘`,
  ]);
});

test("printTable - multiline headers size by their longest line and preserve blank lines", () => {
  const logs = captureTable([{ "a\n\nbb\n": "x", id: 1 }]);
  expect(logs).toStrictEqual([
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

test("printTable - headers and cells share word wrapping and align with wrapped types", () => {
  const header = "first second\nabcdefghijk";
  const logs = captureTable(
    [
      { [header]: "VARCHAR/string", id: "INTEGER/number" },
      { [header]: header, id: 1 },
    ],
    { maxColumnWidth: 10, typesRowIndex: 0 },
  );
  expect(logs).toStrictEqual([
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
