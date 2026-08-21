import quoteIdentifier from "./quoteIdentifier.ts";
import {
  type DuckDBConnection,
  type DuckDBDateValue,
  type DuckDBTimestampTZValue,
  DuckDBTimestampValue,
  type DuckDBType,
  DuckDBTypeId,
  type DuckDBValue,
  type DuckDBValueConverter,
  type Json,
  JsonDuckDBValueConverter,
} from "@duckdb/node-api";
import SDAError from "../class/SDAError.ts";
import observeQuery from "./observeQuery.ts";
import runQueryFromFile from "./runQueryFromFile.ts";

type RunQueryOptions = {
  method: string | null;
  parameters: { [key: string]: unknown } | null;
  table?: string | null;
  values?: DuckDBValue[];
  logSQL: boolean;
  explainSQL: boolean;
  dataTransport?: "direct" | "file";
  rejectGeometry?: boolean;
};

const msPerDay = 24 * 60 * 60 * 1000;
const maxSafeInteger = BigInt(Number.MAX_SAFE_INTEGER);
const minSafeInteger = BigInt(Number.MIN_SAFE_INTEGER);

// Columns already warned about for precision loss (keyed by table and
// column), so each column warns only once.
const warnedUnsafeIntegerColumns = new Set<string>();

function makeIntegerConverter(columnName: string, tableName: string | null) {
  const warnKey = `${tableName ?? ""}\0${columnName}`;
  return (value: DuckDBValue) => {
    if (value === null) {
      return null;
    }
    const bigintValue = value as bigint;
    if (
      (bigintValue > maxSafeInteger || bigintValue < minSafeInteger) &&
      !warnedUnsafeIntegerColumns.has(warnKey)
    ) {
      warnedUnsafeIntegerColumns.add(warnKey);
      console.warn(
        `SDA: Column ${quoteIdentifier(columnName)}${
          tableName === null ? "" : ` of table ${quoteIdentifier(tableName)}`
        } has at least one value exceeding Number.MAX_SAFE_INTEGER. Converted numbers may lose precision.`,
      );
    }
    return Number(bigintValue);
  };
}

function utcTimestampTzValue(value: DuckDBValue): string | null {
  if (value === null) {
    return null;
  }
  const timestamp = new DuckDBTimestampValue(
    (value as DuckDBTimestampTZValue).micros,
  ).toString();
  return timestamp === "infinity" || timestamp === "-infinity"
    ? timestamp
    : `${timestamp}+00`;
}

const utcJsonValueConverter: DuckDBValueConverter<Json> = (
  value,
  type,
  _converter,
) =>
  type.typeId === DuckDBTypeId.TIMESTAMP_TZ
    ? utcTimestampTzValue(value)
    : JsonDuckDBValueConverter(value, type, utcJsonValueConverter);

export function makeConverter(
  type: DuckDBType,
  columnName: string,
  tableName: string | null = null,
): (value: DuckDBValue) => unknown {
  const typeString = type.toString();
  if (typeString.toLowerCase().includes("geometry")) {
    const placeholder = `GEOM(${
      typeString.replace("GEOMETRY('", "").replace("')", "")
    })`;
    return (value) => (value === null ? null : placeholder);
  }
  if (typeString.includes("FLOAT[")) {
    const placeholder = `<${typeString}>`;
    return (value) => (value === null ? null : placeholder);
  }
  switch (type.typeId) {
    case DuckDBTypeId.DATE:
      return (value) =>
        value === null
          ? null
          : new Date((value as DuckDBDateValue).days * msPerDay);
    case DuckDBTypeId.TIMESTAMP:
      return (value) => {
        if (value === null) {
          return null;
        }
        const micros = (value as DuckDBTimestampValue).micros;
        // Floor division, so sub-millisecond precision truncates toward
        // the past for dates before the epoch too.
        const ms = micros >= 0n ? micros / 1000n : (micros - 999n) / 1000n;
        return new Date(Number(ms));
      };
    case DuckDBTypeId.TIMESTAMP_TZ:
      return utcTimestampTzValue;
    case DuckDBTypeId.BIGINT:
    case DuckDBTypeId.HUGEINT:
      return makeIntegerConverter(columnName, tableName);
    default:
      return (value) =>
        utcJsonValueConverter(value, type, utcJsonValueConverter);
  }
}

export default async function runQuery(
  query: string,
  connection: DuckDBConnection,
  returnData: boolean,
  options: RunQueryOptions,
): Promise<
  | {
    [key: string]: unknown;
  }[]
  | null
> {
  const values = options.values ?? [];
  try {
    await observeQuery(connection, query, values, options);
    if (returnData) {
      if (options.dataTransport === "file") {
        return await runQueryFromFile(query, connection, options);
      }
      const result = await connection.run(query, values);
      const columnNames = result.deduplicatedColumnNames();
      const columnTypes = result.columnTypes();
      if (
        options.rejectGeometry === true &&
        columnTypes.some((type) =>
          type.toString().toLowerCase().includes("geometry")
        )
      ) {
        throw new Error(
          "The query returns geometry columns. Use getGeoData() instead.",
        );
      }
      const converters = columnTypes.map((type, i) =>
        makeConverter(type, columnNames[i], options.table ?? null)
      );
      const columnCount = columnNames.length;
      // The result is converted chunk by chunk, so no intermediate row-major
      // copy of the whole result is materialized.
      const rows: { [key: string]: unknown }[] = [];
      while (true) {
        const chunk = await result.fetchChunk();
        if (chunk === null || chunk === undefined || chunk.rowCount === 0) {
          break;
        }
        const base = rows.length;
        for (let i = 0; i < chunk.rowCount; i++) {
          rows.push({});
        }
        for (let j = 0; j < columnCount; j++) {
          const columnName = columnNames[j];
          const converter = converters[j];
          chunk.visitColumnValues(j, (value, rowIndex) => {
            rows[base + rowIndex][columnName] = converter(value);
          });
        }
      }
      return rows;
    } else {
      await connection.run(query, values);
      return null;
    }
  } catch (error) {
    throw new SDAError({
      method: options.method,
      parameters: options.parameters,
      query,
      cause: error,
    });
  }
}
