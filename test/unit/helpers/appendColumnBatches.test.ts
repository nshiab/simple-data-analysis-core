import { assertEquals, assertRejects } from "@std/assert";
import { BIGINT, DOUBLE, DuckDBInstance, VARCHAR } from "@duckdb/node-api";
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
