import { stripVTControlCharacters } from "node:util";
import { test, expect, vi } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("log aligns decomposed filename accents without changing data", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  const data = [
    { fileName: "001 PQ_Tremblay Stephane_QC 2026.png", detected: false },
    { fileName: "006 PLQ_Gue\u0301rette Thomas_QC 2026.png", detected: false },
    { fileName: "Stephanie-Danylko.jpg", detected: true },
    { fileName: "Thunder Bay cand photo.png", detected: true },
  ];
  try {
    const table = sdb.newTable("accented_filenames").loadArray(data);
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    for (const types of [false, true]) {
      lines.length = 0;
      await table.log({ types });
      expect(lines.join("\n").includes(data[1].fileName)).toStrictEqual(true);
      // NFC makes these Latin accents single code units, allowing border
      // positions to be checked independently of the renderer's segmenter.
      const rows = lines
        .map((line) => stripVTControlCharacters(line).normalize("NFC"))
        .filter((line) => line.startsWith("│"));
      expect(rows.length).toStrictEqual(types ? 6 : 5);
      const positions = rows.map((line) => Array.from(line.matchAll(/│/g), (match) => match.index));
      for (const borders of positions) {
        expect(borders).toStrictEqual(positions[0]);
      }
    }
    expect(await table.getData()).toStrictEqual(data);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

test("log applies row counts, filters, and both all-row shorthands", async () => {
  const sdb = new SimpleDB({ rowsToLog: 1 });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb
      .newTable("names")
      .loadArray([{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }]);
    for (const [options, count] of [
      [undefined, 1],
      [2, 2],
      [{ count: 2 }, 2],
      ["all", 3],
      [{ count: "all" }, 3],
    ] as const) {
      log.mockClear();
      await table.log(options);
      const output = log.mock.calls.flat().join("\n");
      expect(output).toContain("Alice");
      expect(output.includes("Bob")).toStrictEqual(count >= 2);
      expect(output.includes("Charlie")).toStrictEqual(count === 3);
      expect(log.mock.calls.at(-1)).toStrictEqual([
        `3 rows in total${count < 3 ? ` / showing ${count} rows` : ""}`,
      ]);
    }
    log.mockClear();
    await table.log({ conditions: "name === 'Bob'" });
    const filtered = log.mock.calls.flat().join("\n");
    expect(filtered).toContain("Bob");
    expect(filtered).not.toContain("Alice");
    expect(filtered).not.toContain("Charlie");
    expect(log.mock.calls.at(-1)).toStrictEqual(["1 rows in total"]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("log renders types for a single column and allows a local override", async () => {
  const sdb = new SimpleDB({ typesToLog: true });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb.newTable("names").loadArray([{ name: "Alice" }]);
    for (const types of [true, false]) {
      log.mockClear();
      await table.log({ types });
      const output = log.mock.calls.flat().join("\n");
      expect(output).toContain("Alice");
      expect(output.includes("VARCHAR/string")).toStrictEqual(types);
    }
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("log reports a table with no data", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await sdb.newTable("empty").log();
    expect(log.mock.calls).toStrictEqual([["\nTable empty: no data"]]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("log renders geometry placeholders", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    const table = sdb.newTable("point").loadGeoData("test/geodata/files/point.json");
    await table.log();
    expect(log.mock.calls.flat().join("\n")).toContain("GEOM(EPSG:4326)");
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("log preserves SQL display precision, nested structure, and value colors", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(`CREATE TABLE display_values AS SELECT
      42::UBIGINT AS id, 1234567890123456.789::DECIMAL(19,3) AS amount,
      DATE '2025-01-01' AS date,
      TIMESTAMP '2025-01-01 00:00:00.123456' AS ts,
      TIMESTAMP_NS '2025-01-01 00:00:00.123456789' AS ns,
      TIMESTAMPTZ '2025-01-01 00:00:00.123456+00' AS tz,
      [1, NULL, 3]::INTEGER[] AS items,
      {'id': 9007199254740993::BIGINT, 'count': 2} AS nested,
      'NaN'::DOUBLE AS nan, 'Infinity'::DOUBLE AS inf,
      '-Infinity'::DOUBLE AS neg, '123.450' AS text,
      true AS active, false AS inactive, NULL::VARCHAR AS missing`);
    const table = sdb.newTable("display_values");
    const before = await table.getData();
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    for (const types of [false, true]) {
      lines.length = 0;
      await table.log({ types });
      const output = lines.join("\n");
      for (const text of [
        "\x1b[36m2025-01-01",
        "\x1b[95mtrue",
        "\x1b[95mfalse",
        "\x1b[90mnull",
        "2025-01-01 00:00:00.123456",
        "2025-01-01 00:00:00.123456789",
        "2025-01-01 00:00:00.123456+00",
        "[1,null,3]",
        '{"id":"9007199254740993","count":2}',
        "\x1b[33m1234567890123456.789",
        "\x1b[33mNaN",
        "\x1b[33mInfinity",
        "\x1b[33m-Infinity",
        "\x1b[32m123.450",
      ]) {
        expect(output.includes(text), text).toStrictEqual(true);
      }
      expect(output.includes("2025-01-01T")).toStrictEqual(false);
      if (types) expect(output.includes("UBIGINT/number")).toStrictEqual(true);
    }
    expect(await table.getData()).toStrictEqual(before);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

test("log handles temporal infinities and null-first or all-null type annotations", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(`CREATE TABLE boundaries AS SELECT * FROM (VALUES
      (NULL::INTEGER, NULL::BIGINT, DATE 'infinity', TIMESTAMP '-infinity'),
      (2, NULL, DATE '-infinity', TIMESTAMP 'infinity')) AS t(value, empty, date, ts)`);
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    await sdb.newTable("boundaries").log({ types: true });
    const output = lines.join("\n");
    for (const text of ["INTEGER/number", "BIGINT/number", "infinity", "-infinity", "null"]) {
      expect(output.includes(text), text).toStrictEqual(true);
    }
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

test("log truncates serialized nested values using the default character budget", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(
      `CREATE TABLE long_nested AS SELECT {'text': repeat('x', 200)} AS nested`,
    );
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const table = sdb.newTable("long_nested");
    expect(table.charsToLog).toStrictEqual(75);
    await table.log();
    expect(lines.join("\n").includes('{"text":"' + "x".repeat(63) + "...")).toStrictEqual(true);
    expect((await table.getData())[0].nested).toStrictEqual({ text: "x".repeat(200) });
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

test("log stringifies nested temporal values instead of treating their containers as dates", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(`CREATE TABLE nested_dates AS SELECT [DATE '2025-01-01', NULL] AS dates`);
    const table = sdb.newTable("nested_dates");
    expect(await table.getData()).toStrictEqual([{ dates: ["2025-01-01", null] }]);
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    await table.log({ types: true });
    expect(lines.join("\n").includes('["2025-01-01",null]')).toStrictEqual(true);
    expect(lines.join("\n").includes("DATE[]/object")).toStrictEqual(true);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

test("log and logBottom retain compact vector labels while getData returns arrays", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    await sdb.customQuery(`CREATE TABLE logged_vectors AS SELECT
      [12.5, NULL]::FLOAT[2] AS vector, [12.5, NULL]::FLOAT[] AS list,
      NULL::FLOAT[2] AS missing`);
    const table = sdb.newTable("logged_vectors");
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    for (const log of [() => table.log(), () => table.logBottom()]) {
      lines.length = 0;
      await log();
      const text = lines.join("\n");
      expect(text.includes("<FLOAT[2]>")).toStrictEqual(true);
      expect(text.includes("<FLOAT[]>")).toStrictEqual(true);
      expect(text.includes("12.5")).toStrictEqual(false);
      expect(text.includes("null")).toStrictEqual(true);
    }
    expect(await table.getData()).toStrictEqual([
      {
        vector: [12.5, null],
        list: [12.5, null],
        missing: null,
      },
    ]);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

test("log footer describes actual displayed rows and matching totals", async () => {
  const sdb = new SimpleDB({ rowsToLog: 5, charsToLog: 20 });
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    const table = sdb
      .newTable("footer")
      .loadArray(Array.from({ length: 11 }, (_, value) => ({ value })));
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    const cases: [Parameters<typeof table.log>[0], string][] = [
      [15, "11 rows in total"],
      [11, "11 rows in total"],
      [5, "11 rows in total / showing 5 rows"],
      [0, "11 rows in total / showing 0 rows"],
      [{ count: 15 }, "11 rows in total"],
      [{ count: 5, types: true }, "11 rows in total / showing 5 rows"],
      [undefined, "11 rows in total / showing 5 rows"],
      ["all", "11 rows in total"],
      [{ count: "all" }, "11 rows in total"],
      [{ count: 15, conditions: "value < 3" }, "3 rows in total"],
      [{ count: 2, conditions: "value < 3" }, "3 rows in total / showing 2 rows"],
      [{ count: "all", conditions: "value < 3" }, "3 rows in total"],
      [{ count: 15, conditions: "value < 0" }, "0 rows in total"],
    ];
    for (const [options, footer] of cases) {
      lines.length = 0;
      await table.log(options);
      expect(lines.at(-1)).toStrictEqual(footer);
    }
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});
