import { DuckDBTimestampValue, type DuckDBValue } from "@duckdb/node-api";

/** Converts a supported JavaScript data value to its DuckDB binding value. */
export default function toDuckDBValue(value: unknown): DuckDBValue {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return null;
  }
  if (value instanceof Date) {
    return new DuckDBTimestampValue(BigInt(value.getTime() * 1000));
  }
  if (
    typeof value === "string" || typeof value === "number" ||
    typeof value === "boolean" || typeof value === "bigint"
  ) {
    return value;
  }
  throw new Error(
    `Unknown bind value type ${typeof value} of ${String(value)}`,
  );
}
