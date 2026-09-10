import { assertEquals } from "@std/assert";
import { DuckDBInstance } from "@duckdb/node-api";
import readMutationRows from "../../../src/helpers/readMutationRows.ts";

Deno.test("mutation reads keep the final cursor separate across DuckDB chunks", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    const result = await readMutationRows(
      connection,
      `SELECT i AS cursor, (i % 7)::INTEGER AS value,
       CASE WHEN i % 2 = 0 THEN NULL ELSE 'label' END AS label
       FROM range(5003) t(i) ORDER BY i`,
      "cursor",
    );
    assertEquals(result.lastCursorValue, 5002n);
    assertEquals(
      result.rows,
      Array.from({ length: 5003 }, (_, i) => ({
        value: i % 7,
        label: i % 2 === 0 ? null : "label",
      })),
    );
    assertEquals(
      [...result.types].map(([name, type]) => [name, String(type)]),
      [["value", "INTEGER"], ["label", "VARCHAR"]],
    );

    const empty = await readMutationRows(
      connection,
      "SELECT 1::BIGINT AS cursor, 2 AS value WHERE false",
      "cursor",
    );
    assertEquals(empty.rows, []);
    assertEquals(empty.lastCursorValue, undefined);
    assertEquals([...empty.types.keys()], ["value"]);

    const ordinary = await readMutationRows(
      connection,
      "SELECT 1::BIGINT AS cursor, 2 AS value",
    );
    assertEquals(ordinary.rows, [{ cursor: 1n, value: 2 }]);
    assertEquals([...ordinary.types.keys()], ["cursor", "value"]);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
