import { test, expect } from "vite-plus/test";

import { DuckDBInstance } from "@duckdb/node-api";
import readMutationRows from "../../../src/helpers/readMutationRows.ts";

test("mutation reads keep the final cursor separate across DuckDB chunks", async () => {
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
    expect(result.lastCursorValue).toStrictEqual(5002n);
    expect(result.rows).toStrictEqual(
      Array.from({ length: 5003 }, (_, i) => ({
        value: i % 7,
        label: i % 2 === 0 ? null : "label",
      })),
    );
    expect([...result.types].map(([name, type]) => [name, String(type)])).toStrictEqual([
      ["value", "INTEGER"],
      ["label", "VARCHAR"],
    ]);

    const empty = await readMutationRows(
      connection,
      "SELECT 1::BIGINT AS cursor, 2 AS value WHERE false",
      "cursor",
    );
    expect(empty.rows).toStrictEqual([]);
    expect(empty.lastCursorValue).toStrictEqual(undefined);
    expect([...empty.types.keys()]).toStrictEqual(["value"]);

    const ordinary = await readMutationRows(connection, "SELECT 1::BIGINT AS cursor, 2 AS value");
    expect(ordinary.rows).toStrictEqual([{ cursor: 1n, value: 2 }]);
    expect([...ordinary.types.keys()]).toStrictEqual(["cursor", "value"]);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
