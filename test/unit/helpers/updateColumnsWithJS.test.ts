import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import updateColumnsWithJS from "../../../src/helpers/updateColumnsWithJS.ts";

test("column generation preserves untouched SQL data and stable row identity", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("enriched");
  try {
    await sdb.customQuery(
      `CREATE TABLE enriched AS SELECT 'same' AS text, 7 AS rowid,
      9007199254740993::BIGINT AS id, DATE '2025-01-01' AS date,
      1234567890123456.789::DECIMAL(19,3) AS amount,
      {'ids': [9007199254740993::BIGINT]} AS nested FROM range(12)`,
    );
    await sdb.customQuery("CREATE TABLE expected AS SELECT * FROM enriched");
    for (const column of ["first", "second", "first"]) {
      await updateColumnsWithJS(table, ["text"], [column], (rows) => {
        expect(rows).toStrictEqual(Array.from({ length: 12 }, () => ({ text: "same" })));
        return Promise.resolve(rows.map((_, i) => ({ [column]: [i, 1] })));
      });
    }
    const data = await sdb.customQuery("SELECT first[1] AS a, second[1] AS b FROM enriched", {
      returnData: true,
    });
    expect(data).toStrictEqual(Array.from({ length: 12 }, (_, i) => ({ a: i, b: i })));
    expect(
      await sdb.customQuery(
        "SELECT count(*) AS differences FROM ((SELECT * EXCLUDE(first, second) FROM enriched) EXCEPT ALL (SELECT * FROM expected))",
        { returnData: true },
      ),
    ).toStrictEqual([{ differences: 0 }]);
    expect((await table.getTypes()).first).toStrictEqual("FLOAT[2]");
    expect((await table.getTypes()).second).toStrictEqual("FLOAT[2]");
    expect(await sdb.getTableNames()).toStrictEqual(["enriched", "expected"]);
  } finally {
    await sdb.close();
  }
});

test("failed generation and staging leave existing data intact", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("unchanged");
  try {
    await table
      .loadArray(
        [
          { text: "a", vector: [1, 2] },
          {
            text: "b",
            vector: [3, 4],
          },
        ],
        { columnTypes: { vector: "FLOAT[2]" } },
      )
      .run();
    const types = await table.getTypes();
    for (const generate of [
      () => Promise.reject(new Error("provider failed")),
      () => Promise.resolve([]),
      () => Promise.resolve([{ vector: [1, 2] }, { vector: [3n, 4n] }]),
    ]) {
      await assertRejects(() => updateColumnsWithJS(table, ["text"], ["vector"], generate));
      expect(await table.getTypes()).toStrictEqual(types);
      expect(
        await sdb.customQuery("SELECT vector[2] AS value FROM unchanged", {
          returnData: true,
        }),
      ).toStrictEqual([{ value: 2 }, { value: 4 }]);
      expect(await sdb.getTableNames()).toStrictEqual(["unchanged"]);
    }
  } finally {
    await sdb.close();
  }
});

test("bounded column generation preserves identity and infers past null batches", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("bounded");
  try {
    await sdb.customQuery(`CREATE TABLE bounded AS SELECT i, 7 AS rowid,
      9007199254740993::BIGINT AS exact, DATE '2025-01-01' AS date
      FROM range(11) t(i)`);
    const sizes: number[] = [];
    await updateColumnsWithJS(
      table,
      ["i"],
      ["vector", "missing"],
      async (rows) => {
        sizes.push(rows.length);
        // The read has finished, so callbacks can use the shared connection.
        await sdb.customQuery("SELECT 1");
        return rows.map((row) => ({
          vector: Number(row.i) < 3 || Number(row.i) >= 6 ? null : [Number(row.i), 1],
          missing: null,
        }));
      },
      { batchSize: 3 },
    );
    expect(sizes).toStrictEqual([3, 3, 3, 2]);
    expect((await table.getTypes()).vector).toStrictEqual("FLOAT[2]");
    expect((await table.getTypes()).missing).toStrictEqual("VARCHAR");
    expect(
      await sdb.customQuery("SELECT i, vector[1] AS value FROM bounded ORDER BY i", {
        returnData: true,
      }),
    ).toStrictEqual(
      Array.from({ length: 11 }, (_, i) => ({
        i,
        value: i >= 3 && i < 6 ? i : null,
      })),
    );
    expect(
      await sdb.customQuery(
        `SELECT count(*) AS valid FROM bounded WHERE rowid = 7
      AND exact = 9007199254740993::BIGINT AND date = DATE '2025-01-01'`,
        { returnData: true },
      ),
    ).toStrictEqual([{ valid: 11 }]);
    expect(await sdb.getTableNames()).toStrictEqual(["bounded"]);
  } finally {
    await sdb.close();
  }
});

test("late generation failures and type changes discard all staged batches", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("atomic");
  try {
    await table.loadArray([{ n: 0 }, { n: 1 }, { n: 2 }]).run();
    for (const mode of ["throw", "length", "type"]) {
      let calls = 0;
      await assertRejects(() =>
        updateColumnsWithJS(
          table,
          ["n"],
          ["result"],
          (rows) => {
            calls++;
            if (calls === 3) {
              if (mode === "throw") throw new Error("late failure");
              if (mode === "length") return Promise.resolve([]);
              return Promise.resolve([{ result: "incompatible" }]);
            }
            return Promise.resolve(rows.map(() => ({ result: 1 })));
          },
          { batchSize: 1 },
        ),
      );
      expect(calls).toStrictEqual(3);
      expect(await table.getData()).toStrictEqual([{ n: 0 }, { n: 1 }, { n: 2 }]);
      expect(await sdb.getTableNames()).toStrictEqual(["atomic"]);
    }
  } finally {
    await sdb.close();
  }
});

test("column generation bounds default batches and validates size before reading", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("defaults");
  try {
    for (const batchSize of [0, -1, 1.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
      await assertRejects(
        () =>
          updateColumnsWithJS(table, ["n"], ["result"], () => Promise.resolve([]), { batchSize }),
        Error,
        "batchSize",
      );
    }
    await sdb.customQuery("CREATE TABLE defaults (n INTEGER)");
    await updateColumnsWithJS(table, ["n"], ["result"], () => {
      throw new Error("Empty tables must not invoke generation");
    });
    expect(await table.getTypes()).toStrictEqual({ n: "INTEGER" });
    expect(await sdb.getTableNames()).toStrictEqual(["defaults"]);
    await sdb.customQuery(
      "CREATE OR REPLACE TABLE defaults AS SELECT i AS n FROM range(2501) t(i)",
    );
    const sizes: number[] = [];
    await updateColumnsWithJS(table, ["n"], ["result"], (rows) => {
      sizes.push(rows.length);
      return Promise.resolve(rows.map(() => ({ result: true })));
    });
    expect(sizes).toStrictEqual([1000, 1000, 501]);
  } finally {
    await sdb.close();
  }
});

test("column generation retains SQL geometry and rejects selected geometry before generation", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("geo");
    await table
      .loadArray(
        [
          {
            text: "a",
            geom: { type: "Point", coordinates: [1.1234567890123457, 2] },
            empty: null,
          },
          { text: "b", geom: null, empty: null },
        ],
        {
          columnTypes: {
            geom: "GEOMETRY('EPSG:4326')",
            empty: "GEOMETRY('EPSG:4326')",
          },
        },
      )
      .run();
    const query =
      "SELECT text, ST_AsWKB(geom)::VARCHAR AS geom, ST_AsWKB(empty)::VARCHAR AS empty FROM geo";
    const before = await sdb.customQuery(query, { returnData: true });
    for (const column of ["label", "vector"]) {
      await updateColumnsWithJS(
        table,
        ["text"],
        [column],
        (rows) =>
          Promise.resolve(
            rows.map((row) => ({
              [column]: column === "label" ? String(row.text).toUpperCase() : [1, 2],
            })),
          ),
        { batchSize: 1 },
      );
    }
    expect(await sdb.customQuery(query, { returnData: true })).toStrictEqual(before);
    expect((await table.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
    expect((await table.getTypes()).empty).toStrictEqual("GEOMETRY('EPSG:4326')");
    for (const [inputs, outputs] of [
      [["GEOM"], ["label"]],
      [["text"], ["GEOM"]],
    ]) {
      let calls = 0;
      await assertRejects(
        () =>
          updateColumnsWithJS(table, inputs, outputs, () => {
            calls++;
            return Promise.resolve([]);
          }),
        Error,
        "Geometry column",
      );
      expect(calls).toStrictEqual(0);
    }
    await assertRejects(() =>
      updateColumnsWithJS(
        table,
        ["text"],
        ["vector"],
        (rows) =>
          Promise.resolve(
            rows.map((row) => ({
              vector: row.text === "a" ? [1, 2] : [3n, 4n],
            })),
          ),
        { batchSize: 1 },
      ),
    );
    expect(await sdb.customQuery(query, { returnData: true })).toStrictEqual(before);
    expect(await sdb.getTableNames()).toStrictEqual(["geo"]);
  } finally {
    await sdb.close();
  }
});

test("column generation writes typed null batches and reordered numeric column names", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("typed batches");
    await table.loadArray(Array.from({ length: 9 }, (_, n) => ({ n }))).run();
    await updateColumnsWithJS(
      table,
      ["n"],
      ["2", "1", "date", "flag"],
      (rows) =>
        Promise.resolve(
          rows.map(({ n }) =>
            Number(n) < 3 || Number(n) >= 6
              ? { "1": null, "2": null, date: null, flag: null }
              : {
                  "1": 9007199254740993n,
                  "2": [Number(n), 1],
                  date: new Date("2025-01-01T00:00:00Z"),
                  flag: true,
                },
          ),
        ),
      { batchSize: 3 },
    );
    expect(await table.getTypes()).toStrictEqual({
      n: "DOUBLE",
      "2": "FLOAT[2]",
      "1": "BIGINT",
      date: "TIMESTAMP",
      flag: "BOOLEAN",
    });
    expect(
      await sdb.customQuery(
        `SELECT count(*) AS n FROM "typed batches" WHERE
      (n >= 3 AND n < 6 AND "1" = 9007199254740993 AND "2"[1] = n
        AND date = TIMESTAMP '2025-01-01' AND flag)
      OR ((n < 3 OR n >= 6) AND "1" IS NULL AND "2" IS NULL AND date IS NULL AND flag IS NULL)`,
        { returnData: true },
      ),
    ).toStrictEqual([{ n: 9 }]);
    expect(await sdb.getTableNames()).toStrictEqual(["typed batches"]);
  } finally {
    await sdb.close();
  }
});
