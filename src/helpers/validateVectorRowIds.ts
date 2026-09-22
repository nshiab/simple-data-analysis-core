import type { DuckDBConnection } from "@duckdb/node-api";

/** Validate the positional identity contract before bounded vector scans. */
export default async function validateVectorRowIds(
  connection: DuckDBConnection,
  rows: string,
  count: number,
): Promise<void> {
  // Graph state and DuckDB scratch schemas use signed INTEGER vertex ids.
  if (!Number.isSafeInteger(count) || count < 1 || count > 2147483647) {
    throw new Error(
      "Vector row count must fit a positive INTEGER vertex count.",
    );
  }
  const [actual, distinct, minimum, maximum, invalid] =
    (await connection.runAndReadAll(`SELECT count(*),count(DISTINCT vertex),
      min(vertex),max(vertex),count(*) FILTER (
        WHERE vertex IS NULL OR vertex!=trunc(vertex)) FROM ${rows}`))
      .getRowsJS()[0];
  if (
    Number(actual) !== count || Number(distinct) !== count ||
    Number(minimum) !== 0 || Number(maximum) !== count - 1 ||
    Number(invalid) !== 0
  ) {
    throw new Error(
      `Vector rows must contain exactly ${count} unique integer vertex ids from 0 to ${
        count - 1
      }.`,
    );
  }
}
