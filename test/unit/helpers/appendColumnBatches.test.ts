import { assertEquals, assertRejects } from "@std/assert";
import {
  BIGINT,
  DOUBLE,
  DuckDBInstance,
  type DuckDBType,
  ENUM,
  INTEGER,
  UINTEGER,
  VARCHAR,
  VARIANT,
} from "@duckdb/node-api";
import appendColumnBatches from "../../../src/helpers/appendColumnBatches.ts";

Deno.test("column batches preserve values across full and partial chunks", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(
      "CREATE TABLE data (id BIGINT, value DOUBLE, label VARCHAR)",
    );
    const rows = Array.from({ length: 4003 }, (_, i) => [
      9007199254740993n + BigInt(i),
      i % 7 === 0 ? null : i / 8,
      i % 11 === 0 ? null : `row-${i}`,
    ]);
    await appendColumnBatches(
      connection,
      "data",
      [BIGINT, DOUBLE, VARCHAR],
      rows.length,
      (column, start, end) => rows.slice(start, end).map((row) => row[column]),
    );
    await appendColumnBatches(
      connection,
      "data",
      [BIGINT, DOUBLE, VARCHAR],
      0,
      () => {
        throw new Error("Empty input must not request values.");
      },
    );
    assertEquals(
      (await connection.runAndReadAll("SELECT * FROM data ORDER BY id"))
        .getRowsJS(),
      rows,
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

const writeCases: {
  type: DuckDBType;
  valid: (number | bigint | string | null)[];
  invalid: (number | bigint | string)[];
}[] = [
  {
    type: INTEGER,
    valid: [-2147483648, 2147483647, null],
    invalid: [-2147483649, 2147483648, 1.5, NaN, Infinity],
  },
  {
    type: UINTEGER,
    valid: [0, 4294967295, null],
    invalid: [-1, 4294967296, 1.5],
  },
  {
    type: BIGINT,
    valid: [-9223372036854775808n, 9223372036854775807n, null],
    invalid: [-9223372036854775809n, 9223372036854775808n],
  },
  {
    type: ENUM(["ok", "__proto__"]),
    valid: ["ok", "__proto__", null],
    invalid: ["unknown", "OK", "toString"],
  },
];

for (const { type, valid, invalid } of writeCases) {
  Deno.test(`column batches validate ${type} and recover after a late invalid value`, async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      await connection.run(`CREATE TABLE data (value ${type})`);
      for (const value of invalid) {
        await connection.run("BEGIN TRANSACTION");
        await assertRejects(
          () =>
            appendColumnBatches(
              connection,
              "data",
              [type],
              2001,
              (_, start, end) =>
                Array.from({ length: end - start }, (_, i) =>
                  start + i === 2000 ? value : valid[0]),
            ),
          Error,
        );
        await connection.run("ROLLBACK");
        assertEquals(
          (await connection.runAndReadAll("SELECT count(*) FROM data"))
            .getRowsJS(),
          [[0n]],
        );
      }
      await appendColumnBatches(
        connection,
        "data",
        [type],
        valid.length,
        () => valid,
      );
      assertEquals(
        (await connection.runAndReadAll("SELECT * FROM data ORDER BY rowid"))
          .getRowsJS(),
        valid.map((value) => [value]),
      );
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
}

Deno.test("column batches reject unsupported VARIANT chunks and release the appender", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run("CREATE TABLE data (value VARIANT)");
    await assertRejects(
      () => appendColumnBatches(connection, "data", [VARIANT], 1, () => [null]),
      Error,
      "Cannot create a data chunk with these column types: VARIANT",
    );
    await connection.run("DROP TABLE data; CREATE TABLE data (value INTEGER)");
    await appendColumnBatches(connection, "data", [INTEGER], 1, () => [42]);
    assertEquals(
      (await connection.runAndReadAll("SELECT * FROM data")).getRowsJS(),
      [[42]],
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("column batch failures allow caller rollback and subsequent appends", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run("CREATE TABLE data (value DOUBLE); BEGIN TRANSACTION");
    await assertRejects(
      () =>
        appendColumnBatches(
          connection,
          "data",
          [DOUBLE],
          2001,
          (_, start, end) => {
            if (start > 0) throw new Error("conversion failed");
            return Array.from({ length: end - start }, (_, row) => start + row);
          },
        ),
      Error,
      "conversion failed",
    );
    await connection.run("ROLLBACK");
    await appendColumnBatches(connection, "data", [DOUBLE], 1, () => [42]);
    assertEquals(
      (await connection.runAndReadAll("SELECT * FROM data")).getRowsJS(),
      [[42]],
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
