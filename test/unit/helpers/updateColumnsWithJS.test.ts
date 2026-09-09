import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import updateColumnsWithJS from "../../../src/helpers/updateColumnsWithJS.ts";

Deno.test("column generation preserves untouched SQL data and stable row identity", async () => {
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
        assertEquals(
          rows,
          Array.from({ length: 12 }, () => ({ text: "same" })),
        );
        return Promise.resolve(rows.map((_, i) => ({ [column]: [i, 1] })));
      });
    }
    const data = await sdb.customQuery(
      "SELECT first[1] AS a, second[1] AS b FROM enriched",
      { returnData: true },
    );
    assertEquals(data, Array.from({ length: 12 }, (_, i) => ({ a: i, b: i })));
    assertEquals(
      await sdb.customQuery(
        "SELECT count(*) AS differences FROM ((SELECT * EXCLUDE(first, second) FROM enriched) EXCEPT ALL (SELECT * FROM expected))",
        { returnData: true },
      ),
      [{ differences: 0 }],
    );
    assertEquals((await table.getTypes()).first, "FLOAT[2]");
    assertEquals((await table.getTypes()).second, "FLOAT[2]");
    assertEquals(await sdb.getTableNames(), ["enriched", "expected"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("failed generation and staging leave existing data intact", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("unchanged");
  try {
    await table.loadArray([{ text: "a", vector: [1, 2] }, {
      text: "b",
      vector: [3, 4],
    }]).run();
    const types = await table.getTypes();
    for (
      const generate of [
        () => Promise.reject(new Error("provider failed")),
        () => Promise.resolve([]),
        () => Promise.resolve([{ vector: [1, 2] }, { vector: [3n, 4n] }]),
      ]
    ) {
      await assertRejects(() =>
        updateColumnsWithJS(table, ["text"], ["vector"], generate)
      );
      assertEquals(await table.getTypes(), types);
      assertEquals(
        await sdb.customQuery("SELECT vector[2] AS value FROM unchanged", {
          returnData: true,
        }),
        [{ value: 2 }, { value: 4 }],
      );
      assertEquals(await sdb.getTableNames(), ["unchanged"]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("bounded column generation preserves identity and infers past null batches", async () => {
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
          vector: Number(row.i) < 3 || Number(row.i) >= 6
            ? null
            : [Number(row.i), 1],
          missing: null,
        }));
      },
      { batchSize: 3 },
    );
    assertEquals(sizes, [3, 3, 3, 2]);
    assertEquals((await table.getTypes()).vector, "FLOAT[2]");
    assertEquals((await table.getTypes()).missing, "VARCHAR");
    assertEquals(
      await sdb.customQuery(
        "SELECT i, vector[1] AS value FROM bounded ORDER BY i",
        { returnData: true },
      ),
      Array.from({ length: 11 }, (_, i) => ({
        i,
        value: i >= 3 && i < 6 ? i : null,
      })),
    );
    assertEquals(
      await sdb.customQuery(
        `SELECT count(*) AS valid FROM bounded WHERE rowid = 7
      AND exact = 9007199254740993::BIGINT AND date = DATE '2025-01-01'`,
        { returnData: true },
      ),
      [{ valid: 11 }],
    );
    assertEquals(await sdb.getTableNames(), ["bounded"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("late generation failures and type changes discard all staged batches", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("atomic");
  try {
    await table.loadArray([{ n: 0 }, { n: 1 }, { n: 2 }]).run();
    for (const mode of ["throw", "length", "type"]) {
      let calls = 0;
      await assertRejects(() =>
        updateColumnsWithJS(table, ["n"], ["result"], (rows) => {
          calls++;
          if (calls === 3) {
            if (mode === "throw") throw new Error("late failure");
            if (mode === "length") return Promise.resolve([]);
            return Promise.resolve([{ result: "incompatible" }]);
          }
          return Promise.resolve(rows.map(() => ({ result: 1 })));
        }, { batchSize: 1 })
      );
      assertEquals(calls, 3);
      assertEquals(await table.getData(), [{ n: 0 }, { n: 1 }, { n: 2 }]);
      assertEquals(await sdb.getTableNames(), ["atomic"]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("column generation bounds default batches and validates size before reading", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("defaults");
  try {
    for (
      const batchSize of [
        0,
        -1,
        1.5,
        Infinity,
        NaN,
        Number.MAX_SAFE_INTEGER + 1,
      ]
    ) {
      await assertRejects(
        () =>
          updateColumnsWithJS(
            table,
            ["n"],
            ["result"],
            () => Promise.resolve([]),
            { batchSize },
          ),
        Error,
        "batchSize",
      );
    }
    await sdb.customQuery("CREATE TABLE defaults (n INTEGER)");
    await updateColumnsWithJS(table, ["n"], ["result"], () => {
      throw new Error("Empty tables must not invoke generation");
    });
    assertEquals(await table.getTypes(), { n: "INTEGER" });
    assertEquals(await sdb.getTableNames(), ["defaults"]);
    await sdb.customQuery(
      "CREATE OR REPLACE TABLE defaults AS SELECT i AS n FROM range(2501) t(i)",
    );
    const sizes: number[] = [];
    await updateColumnsWithJS(table, ["n"], ["result"], (rows) => {
      sizes.push(rows.length);
      return Promise.resolve(rows.map(() => ({ result: true })));
    });
    assertEquals(sizes, [1000, 1000, 501]);
  } finally {
    await sdb.close();
  }
});
