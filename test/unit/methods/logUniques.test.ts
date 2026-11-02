import { stripVTControlCharacters } from "node:util";
import { test, expect, vi } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should preserve array output and stringify support for a column name", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb
      .newTable("names")
      .loadArray([{ name: "Bob" }, { name: "Alice" }, { name: "Bob" }]);
    for (const stringify of [false, true]) {
      log.mockClear();
      expect(await table.logUniques("name", { stringify })).toBe(table);
      const values = ["Alice", "Bob"];
      expect(log.mock.calls).toStrictEqual([
        ["\nTable names — unique values in name:"],
        [stringify ? JSON.stringify(values, null, 2) : values],
      ]);
    }
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should log all sorted unique combinations as a table without changing the data", async () => {
  const sdb = new SimpleDB({ rowsToLog: 1 });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const data = [
      { yearStart: 2021, yearEnd: 2022, label: "first" },
      { yearStart: 2020, yearEnd: 2023, label: "second" },
      { yearStart: 2020, yearEnd: 2021, label: "third" },
      { yearStart: 2020, yearEnd: 2021, label: "duplicate pair" },
    ];
    const table = sdb.newTable("years").loadArray(data);
    expect(await table.logUniques(["yearStart", "yearEnd"])).toBe(table);
    expect(log.mock.calls[0]).toStrictEqual([
      "\nTable years — unique combinations in yearStart, yearEnd:",
    ]);
    const lines = log.mock.calls.map((args) => stripVTControlCharacters(args.join(" ")));
    expect(lines).toContain("┌───────────┬─────────┐");
    expect(lines.filter((line) => line.startsWith("│"))).toStrictEqual([
      "│ yearStart │ yearEnd │",
      "│ 2020      │ 2021    │",
      "│ 2020      │ 2023    │",
      "│ 2021      │ 2022    │",
    ]);
    expect(await table.getData()).toStrictEqual(data);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should log row objects as complete JSON when stringifying column arrays", async () => {
  const sdb = new SimpleDB({ charsToLog: 3 });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb.newTable("names").loadArray([
      { name: "Alice", department: "News" },
      { name: "Alice", department: "News" },
    ]);
    for (const columns of [["name"], ["department", "name"]]) {
      log.mockClear();
      expect(await table.logUniques(columns, { stringify: true })).toBe(table);
      expect(log.mock.calls).toStrictEqual([
        [`\nTable names — unique combinations in ${columns.join(", ")}:`],
        [JSON.stringify(await table.getUniques(columns), null, 2)],
      ]);
      expect(log.mock.calls[1][0]).toContain("Alice");
    }
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should render a one-column array as a table and respect the cell character budget", async () => {
  const sdb = new SimpleDB({ charsToLog: 6 });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb.newTable("names").loadArray([{ name: "Alexandra" }]);
    await table.logUniques(["name"]);
    const lines = log.mock.calls.map((args) => stripVTControlCharacters(args.join(" ")));
    expect(lines.filter((line) => line.startsWith("│"))).toStrictEqual([
      "│ name   │",
      "│ Ale... │",
    ]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should log empty combinations and reject empty column arrays", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb
      .newTable("empty")
      .loadArray([{ first: 1, second: 2 }])
      .filter("false");
    await table.logUniques(["first", "second"]);
    expect(log.mock.calls).toStrictEqual([
      ["\nTable empty — unique combinations in first, second:"],
      [[]],
    ]);
    log.mockClear();
    await expect(table.logUniques([])).rejects.toThrow("requires at least one column");
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});
