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

test("should log sorted unique combinations using the configured row limit", async () => {
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
    ]);
    expect(log.mock.calls.at(-1)).toStrictEqual(["3 rows in total / showing 1 rows"]);
    expect(await table.getData()).toStrictEqual(data);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should accept the same row count options and shorthands as log", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb
      .newTable("values")
      .loadArray([{ value: 3 }, { value: 1 }, { value: 2 }, { value: 1 }]);
    for (const [options, count] of [
      [undefined, 3],
      [2, 2],
      [{ count: 2 }, 2],
      ["all", 3],
      [{ count: "all" }, 3],
      [0, 0],
    ] as const) {
      log.mockClear();
      expect(await table.logUniques(["value"], options)).toBe(table);
      const lines = log.mock.calls.map((args) => stripVTControlCharacters(args.join(" ")));
      expect(lines.filter((line) => line.startsWith("│"))).toStrictEqual(
        count === 0
          ? []
          : ["│ value │", ...[1, 2, 3].slice(0, count).map((value) => `│ ${value}     │`)],
      );
      expect(log.mock.calls.at(-1)).toStrictEqual([
        `3 rows in total${count < 3 ? ` / showing ${count} rows` : ""}`,
      ]);
    }
    table.rowsToLog = 2;
    log.mockClear();
    await table.logUniques(["value"]);
    expect(log.mock.calls.at(-1)).toStrictEqual(["3 rows in total / showing 2 rows"]);
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
      ["0 rows in total"],
    ]);
    log.mockClear();
    await expect(table.logUniques([])).rejects.toThrow("requires at least one column");
    expect(log).not.toHaveBeenCalled();
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should use log's default of ten rows for column arrays", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb.newTable().loadArray(Array.from({ length: 12 }, (_, value) => ({ value })));
    await table.logUniques(["value"]);
    const lines = log.mock.calls.map((args) => stripVTControlCharacters(args.join(" ")));
    expect(lines.filter((line) => line.startsWith("│"))).toHaveLength(11);
    expect(log.mock.calls.at(-1)).toStrictEqual(["12 rows in total / showing 10 rows"]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should filter combinations and log only the selected column types", async () => {
  const sdb = new SimpleDB({ typesToLog: true, rowsToLog: 1 });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb.newTable("years").loadArray([
      { yearStart: 2020, yearEnd: 2022, label: "first" },
      { yearStart: 2020, yearEnd: 2021, label: "second" },
      { yearStart: 2020, yearEnd: 2021, label: "duplicate" },
      { yearStart: 2021, yearEnd: 2022, label: "third" },
    ]);
    for (const types of [undefined, false]) {
      log.mockClear();
      await table.logUniques(["yearEnd", "yearStart"], {
        types,
        conditions: "yearStart === 2020 && yearEnd > 2020",
      });
      const output = stripVTControlCharacters(log.mock.calls.flat().join("\n"));
      expect(output).toContain("yearEnd");
      expect(output).toContain("yearStart");
      expect(output.includes("DOUBLE/number")).toBe(types === undefined);
      expect(output).not.toContain("label");
      expect(log.mock.calls.at(-1)).toStrictEqual(["2 rows in total / showing 1 rows"]);
    }
    log.mockClear();
    await table.logUniques(["yearStart", "yearEnd"], { count: "all", types: true });
    expect(log.mock.calls.at(-1)).toStrictEqual(["3 rows in total"]);
    expect(log.mock.calls.flat().join("\n")).toContain("DOUBLE/number");
    log.mockClear();
    await table.logUniques(["yearStart"], { conditions: "yearStart < 0" });
    expect(log.mock.calls.at(-1)).toStrictEqual(["0 rows in total"]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should preserve native log formatting for temporal and nested combinations", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await sdb.customQuery(`CREATE TABLE values_to_log AS SELECT
      TIMESTAMP '2025-01-01 00:00:00.123456' AS time,
      [1, NULL, 3]::INTEGER[] AS items`);
    await sdb.newTable("values_to_log").logUniques(["time", "items"], { types: true });
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("2025-01-01 00:00:00.123456");
    expect(output).toContain("[1,null,3]");
    expect(output).toContain("TIMESTAMP/object");
    expect(output).toContain("INTEGER[]/object");
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should reject stringify for column arrays and table options for column names", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 1 }]);
    // @ts-expect-error stringify is only available for a column name.
    await expect(table.logUniques(["value"], { stringify: true })).rejects.toThrow(
      "stringify is only supported with a single column name",
    );
    // @ts-expect-error table logging options require an array of column names.
    await expect(table.logUniques("value", { count: 1 })).rejects.toThrow(
      "table logging options require an array of column names",
    );
    await expect(table.logUniques(["value"], -1)).rejects.toThrow(
      "limit must be an integer greater than or equal to 0",
    );
    await expect(table.logUniques(["missing"])).rejects.toThrow("does not have a column named");
  } finally {
    await sdb.close();
  }
});
