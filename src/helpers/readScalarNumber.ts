import type { DuckDBConnection } from "@duckdb/node-api";

// For internal queries returning a single numeric value, such as row counts.
export default async function readScalarNumber(
  connection: DuckDBConnection,
  sql: string,
) {
  return Number((await connection.runAndReadAll(sql)).getRowsJS()[0][0]);
}
