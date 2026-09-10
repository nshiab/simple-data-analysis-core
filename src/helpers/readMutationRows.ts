import {
  DuckDBArrayValue,
  type DuckDBConnection,
  DuckDBDateValue,
  DuckDBListValue,
  DuckDBStructValue,
  DuckDBTimestampValue,
  type DuckDBType,
  type DuckDBValue,
} from "@duckdb/node-api";

/** Reads mutation values, optionally keeping a pagination cursor out of rows. */
export default async function readMutationRows(
  connection: DuckDBConnection,
  query: string,
  cursorColumn?: string,
) {
  const result = await connection.run(query);
  const names = result.deduplicatedColumnNames();
  const types = result.columnTypes();
  const cursorIndex = cursorColumn === undefined
    ? -1
    : names.indexOf(cursorColumn);
  let lastCursorValue: DuckDBValue | undefined;
  const dates = new WeakMap<Date, { millis: number; value: DuckDBValue }>();
  const convert = (value: DuckDBValue): unknown => {
    if (
      value instanceof DuckDBDateValue || value instanceof DuckDBTimestampValue
    ) {
      const millis = value instanceof DuckDBDateValue
        ? value.days * 86400000
        : Number(
          value.micros >= 0n
            ? value.micros / 1000n
            : (value.micros - 999n) / 1000n,
        );
      const date = new Date(millis);
      // Infinite/out-of-range dates retain their native representation.
      if (!Number.isFinite(date.getTime())) return value;
      dates.set(date, { millis, value });
      return date;
    }
    if (value instanceof DuckDBArrayValue || value instanceof DuckDBListValue) {
      return value.items.map(convert);
    }
    if (value instanceof DuckDBStructValue) {
      return Object.fromEntries(
        Object.entries(value.entries).map((
          [key, item],
        ) => [key, convert(item)]),
      );
    }
    // In particular, decimals and high-resolution temporal values stay native.
    return value;
  };
  const rows: Record<string, unknown>[] = [];
  while (true) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    const offset = rows.length;
    for (let i = 0; i < chunk.rowCount; i++) rows.push({});
    for (let i = 0; i < names.length; i++) {
      if (i === cursorIndex) {
        lastCursorValue = chunk.getColumnVector(i).getItem(chunk.rowCount - 1);
        continue;
      }
      chunk.visitColumnValues(i, (value, row) => {
        rows[offset + row][names[i]] = convert(value);
      });
    }
  }
  const toNative = (value: unknown, type: DuckDBType): DuckDBValue => {
    if (value === null || value === undefined) return null;
    if (value instanceof Date) {
      const original = dates.get(value);
      if (
        original && value.getTime() === original.millis &&
        type.toString() ===
          (original.value instanceof DuckDBDateValue ? "DATE" : "TIMESTAMP")
      ) {
        return original.value;
      }
      if (type.toString() === "DATE") {
        if (value.getTime() % 86400000 !== 0) {
          throw new Error("DATE values must represent midnight UTC.");
        }
        return new DuckDBDateValue(value.getTime() / 86400000);
      }
      return new DuckDBTimestampValue(BigInt(value.getTime()) * 1000n);
    }
    if (Array.isArray(value) && "valueType" in type) {
      if ("length" in type && value.length !== type.length) {
        throw new Error(`Expected ${type.length} array elements for ${type}.`);
      }
      const items = value.map((item: unknown) =>
        toNative(item, type.valueType)
      );
      return "length" in type
        ? new DuckDBArrayValue(items)
        : new DuckDBListValue(items);
    }
    if (
      typeof value === "object" && "entryNames" in type && "entryTypes" in type
    ) {
      return new DuckDBStructValue(
        Object.fromEntries(
          type.entryNames.map((
            name,
            i,
          ) => [
            name,
            toNative(
              (value as Record<string, unknown>)[name],
              type.entryTypes[i],
            ),
          ]),
        ),
      );
    }
    return value as DuckDBValue;
  };
  return {
    rows,
    types: new Map(
      names.flatMap((name, i) => i === cursorIndex ? [] : [[name, types[i]]]),
    ),
    lastCursorValue,
    toNative,
  };
}
