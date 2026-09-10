import {
  arrayValue,
  type DuckDBConnection,
  DuckDBDataChunk,
  DuckDBDateValue,
  DuckDBTimestampTZValue,
  DuckDBTimestampValue,
  DuckDBTimeValue,
  type DuckDBValue,
} from "@duckdb/node-api";
import prepareGeometry from "../helpers/prepareGeometry.ts";
import prepareJSON from "../helpers/prepareJSON.ts";
import geometryFromJSON from "../helpers/geometryFromJSON.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import parseType from "../helpers/parseTypes.ts";
import parseDuckDBType from "../helpers/parseDuckDBType.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default function loadArray(
  simpleTable: SimpleTable,
  rows: { [key: string]: unknown }[],
  options: NonNullable<Parameters<SimpleTable["loadArray"]>[1]> = {},
) {
  // This validation doesn't need the database, so it stays at call time.
  if (rows.length === 0) {
    throw new Error(
      "The array is empty. loadArray needs at least one object to infer the column types.",
    );
  }

  const prepared = prepareArray(rows, options.columnTypes, true);

  queueOp(simpleTable, {
    kind: "barrier",
    method: "loadArray()",
    parameters: { rows: `${rows.length} rows` },
    execute: () => executePreparedArray(simpleTable, prepared),
  });
}

type PreparedArray = {
  keys: string[];
  types: string[];
  columnsData: DuckDBValue[][];
  rowCount: number;
};

export function prepareArray(
  rows: { [key: string]: unknown }[],
  columnTypes: { [key: string]: string } = {},
  requireExplicitNestedTypes = false,
): PreparedArray {
  const keys = Object.keys(rows[0]);
  const overrides = new Map<string, string>();
  for (const [key, type] of Object.entries(columnTypes)) {
    if (!keys.includes(key)) {
      throw new Error(
        `Unknown column ${JSON.stringify(key)} in loadArray columnTypes.`,
      );
    }
    if (type.toUpperCase() === "JSON") {
      overrides.set(key, "JSON");
      continue;
    }
    if (/^geometry/i.test(type)) {
      if (!/^geometry\('EPSG:4326'\)$/i.test(type)) {
        throw new Error(
          `Unsupported type ${JSON.stringify(type)} for column ${
            JSON.stringify(key)
          }. GeoJSON ingestion requires GEOMETRY('EPSG:4326'); reproject input to WGS84 first.`,
        );
      }
      overrides.set(key, "GEOMETRY('EPSG:4326')");
      continue;
    }
    try {
      const normalized = parseType(type as Parameters<typeof parseType>[0]);
      parseDuckDBType(normalized);
      overrides.set(key, normalized);
    } catch {
      throw new Error(
        `Unsupported type ${JSON.stringify(type)} for column ${
          JSON.stringify(key)
        }.`,
      );
    }
  }
  const firstNonNullValue = keys.map((key) =>
    rows.find((obj) => obj[key] !== null && obj[key] !== undefined)
      ?.[key]
  );
  const types: string[] = [];
  const columnsData: DuckDBValue[][] = keys.map(
    () => new Array(rows.length),
  );

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const columnData = columnsData[i];
    const override = overrides.get(key);
    if (override !== undefined) {
      types[i] = override;
      for (let j = 0; j < rows.length; j++) {
        columnData[j] = prepareTypedValue(rows[j][key], override, key, j + 1);
      }
      continue;
    }
    if (requireExplicitNestedTypes) {
      for (let j = 0; j < rows.length; j++) {
        const cell = rows[j][key];
        if (
          cell !== null && typeof cell === "object" && !(cell instanceof Date)
        ) {
          throw new Error(
            `Column ${JSON.stringify(key)}, row ${
              j + 1
            }: array and object cells require an explicit columnTypes entry. Use JSON for nested data, FLOAT[n] for fixed-size vectors, or GEOMETRY('EPSG:4326') for GeoJSON geometries.`,
          );
        }
      }
    }
    const value = firstNonNullValue[i];
    const type = typeof value;
    if (type === "symbol" || type === "function") {
      throw new Error(`Type ${type} not supported for ${key}. Value: ${value}`);
    } else if (type === "undefined") {
      types[i] = "VARCHAR";
      for (let j = 0; j < rows.length; j++) {
        columnData[j] = null;
      }
    } else if (type === "object") {
      if (value instanceof Date) {
        types[i] = "TIMESTAMP";
        for (let j = 0; j < rows.length; j++) {
          const d = rows[j][key];
          if (d === null || d === undefined || Number.isNaN(d)) {
            columnData[j] = null;
          } else {
            const date = d as Date;
            columnData[j] = new DuckDBTimestampValue(
              BigInt(date.getTime() * 1000),
            );
          }
        }
      } else if (Array.isArray(value)) {
        types[i] = `FLOAT[${value.length}]`;
        for (let j = 0; j < rows.length; j++) {
          const d = rows[j][key];
          columnData[j] = d === null || d === undefined
            ? null
            : arrayValue([...(d as number[])]);
        }
      } else {
        throw new Error(
          `Type object not supported for ${key}. Value: ${value}`,
        );
      }
    } else {
      types[i] = parseType(type);
      for (let j = 0; j < rows.length; j++) {
        const d = rows[j][key];
        columnData[j] = d === null || d === undefined || Number.isNaN(d)
          ? null
          : d as DuckDBValue;
      }
    }
  }

  return { keys, types, columnsData, rowCount: rows.length };
}

export async function executePreparedArray(
  simpleTable: SimpleTable,
  prepared: PreparedArray,
) {
  if (simpleTable.connection === undefined) {
    await simpleTable.sdb.start();
    simpleTable.connection = simpleTable.sdb.connection;
  }

  const { keys, types, columnsData, rowCount } = prepared;

  const hasGeometry = types.includes("GEOMETRY('EPSG:4326')");
  const needsConversion = hasGeometry || types.includes("JSON");
  const staged = needsConversion
    ? `__sda_array_${crypto.randomUUID().replaceAll("-", "")}`
    : simpleTable.name;
  const storageTypes = types.map((type) =>
    type.startsWith("GEOMETRY") || type === "JSON" ? "VARCHAR" : type
  );
  if (hasGeometry && !simpleTable.sdb.spatialLoaded) {
    await simpleTable.sdb.customQuery(
      "INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;",
    );
    simpleTable.sdb.spatialLoaded = true;
  }
  try {
    await simpleTable.sdb.customQuery(
      `CREATE ${needsConversion ? "TEMP" : "OR REPLACE"} TABLE ${
        quoteIdentifier(staged)
      }(${
        keys.map((key, i) => `${quoteIdentifier(key)} ${storageTypes[i]}`).join(
          ", ",
        )
      })`,
    );

    const appender = await (simpleTable.connection as DuckDBConnection)
      .createAppender(staged);

    try {
      const duckDBTypes = storageTypes.map((d) => parseDuckDBType(d));
      // The maximum capacity of a DuckDB data chunk is 2048 rows.
      const chunkSize = 2000;
      for (let start = 0; start < rowCount; start += chunkSize) {
        const end = Math.min(start + chunkSize, rowCount);
        const dataChunk = DuckDBDataChunk.create(duckDBTypes, end - start);
        for (let i = 0; i < keys.length; i++) {
          dataChunk.setColumnValues(i, columnsData[i].slice(start, end));
        }
        appender.appendDataChunk(dataChunk);
      }

      appender.flushSync();
    } finally {
      appender.closeSync();
    }
    if (!needsConversion) return;
    // CTAS is atomic: conversion must finish before the destination is replaced.
    await simpleTable.sdb.customQuery(
      `CREATE OR REPLACE TABLE ${quoteIdentifier(simpleTable.name)} AS SELECT ${
        keys.map((key, i) =>
          types[i].startsWith("GEOMETRY")
            ? `${geometryFromJSON(quoteIdentifier(key))} AS ${
              quoteIdentifier(key)
            }`
            : types[i] === "JSON"
            ? `${quoteIdentifier(key)}::JSON AS ${quoteIdentifier(key)}`
            : quoteIdentifier(key)
        ).join(", ")
      } FROM ${quoteIdentifier(staged)}`,
    );
  } finally {
    if (needsConversion) {
      await simpleTable.sdb.customQuery(
        `DROP TABLE IF EXISTS ${quoteIdentifier(staged)}`,
      );
    }
  }
}

/** Validates and snapshots a value for an explicitly declared destination type. */
function prepareTypedValue(
  value: unknown,
  type: string,
  column: string,
  row: number,
): DuckDBValue {
  if (type === "JSON") return prepareJSON(value, column, row);
  if (type === "GEOMETRY('EPSG:4326')") {
    return prepareGeometry(value, column, row);
  }
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  let compatible = false;
  if (type === "VARCHAR" && typeof value === "string") return value;
  if (type === "BOOLEAN" && typeof value === "boolean") return value;
  if (type === "DOUBLE") {
    if (typeof value === "number") return value;
    compatible = typeof value === "bigint";
    if (typeof value === "bigint") {
      const number = Number(value);
      if (Number.isFinite(number) && BigInt(number) === value) return number;
    }
  } else if (type === "INTEGER") {
    compatible = typeof value === "number" || typeof value === "bigint";
    if (typeof value === "number") {
      if (
        Number.isInteger(value) && value >= -2147483648 && value <= 2147483647
      ) {
        return value;
      }
    } else if (
      typeof value === "bigint" && value >= -2147483648n && value <= 2147483647n
    ) {
      return Number(value);
    }
  } else if (type === "BIGINT") {
    compatible = typeof value === "number" || typeof value === "bigint";
    if (typeof value === "bigint") {
      if (value >= -9223372036854775808n && value <= 9223372036854775807n) {
        return value;
      }
    } else if (
      typeof value === "number" && Number.isInteger(value) &&
      value >= -(2 ** 63) && value < 2 ** 63
    ) {
      // The upper bound is exclusive: 2 ** 63 - 1 rounds up as a JS number.
      return BigInt(value);
    }
  } else if (
    ["DATE", "TIME", "TIMESTAMP", "TIMESTAMP WITH TIME ZONE"].includes(type)
  ) {
    if (type === "TIME" && value instanceof DuckDBTimeValue) {
      if (value.micros >= 0n && value.micros <= 86400000000n) {
        return new DuckDBTimeValue(value.micros);
      }
      compatible = true;
    } else if (value instanceof Date) {
      const millis = value.getTime();
      compatible = Number.isFinite(millis);
      if (compatible) {
        if (type === "DATE" && millis % 86400000 === 0) {
          return new DuckDBDateValue(millis / 86400000);
        }
        const micros = BigInt(millis) * 1000n;
        if (type === "TIMESTAMP") return new DuckDBTimestampValue(micros);
        if (type === "TIMESTAMP WITH TIME ZONE") {
          return new DuckDBTimestampTZValue(micros);
        }
      }
    }
  } else if (type.startsWith("FLOAT[") && Array.isArray(value)) {
    compatible = true;
    const size = Number(type.slice(6, -1));
    if (
      value.length === size &&
      value.every((item) =>
        item === null || item === undefined ||
        (typeof item === "number" &&
          (Number.isNaN(item) || Math.fround(item) === item))
      )
    ) {
      return arrayValue(
        value.map((item: unknown) =>
          item === undefined || Number.isNaN(item)
            ? null
            : item as number | null
        ),
      );
    }
  }
  const displayed = typeof value === "string"
    ? JSON.stringify(value)
    : String(value);
  throw new Error(
    `Column ${JSON.stringify(column)}, row ${row}: value ${displayed} ${
      compatible
        ? `cannot be stored as ${type} without losing information`
        : `is incompatible with ${type}`
    }. Select a type compatible with this value.`,
  );
}
