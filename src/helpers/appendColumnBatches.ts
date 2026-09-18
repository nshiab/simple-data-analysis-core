import {
  type DuckDBConnection,
  DuckDBDataChunk,
  type DuckDBType,
  type DuckDBValue,
} from "@duckdb/node-api";

// Append to an existing table. Callers retain ownership of type conversion and
// publication; each column callback supplies only the requested [start, end).
export default async function appendColumnBatches(
  connection: DuckDBConnection,
  table: string,
  types: readonly DuckDBType[],
  rowCount: number,
  columnValues: (
    column: number,
    start: number,
    end: number,
  ) => readonly DuckDBValue[],
) {
  const appender = await connection.createAppender(table);
  try {
    // Stay below DuckDB's maximum chunk capacity of 2048 rows.
    for (let start = 0; start < rowCount; start += 2000) {
      const end = Math.min(start + 2000, rowCount);
      const chunk = DuckDBDataChunk.create(types, end - start);
      for (let column = 0; column < types.length; column++) {
        chunk.setColumnValues(column, columnValues(column, start, end));
      }
      appender.appendDataChunk(chunk);
    }
    appender.flushSync();
  } finally {
    appender.closeSync();
  }
}
