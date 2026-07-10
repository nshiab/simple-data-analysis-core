import {
  arrayValue,
  type DuckDBConnection,
  DuckDBDataChunk,
  DuckDBTimestampValue,
  type DuckDBValue,
} from "@duckdb/node-api";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import parseType from "../helpers/parseTypes.ts";
import parseDuckDBType from "../helpers/parseDuckDBType.ts";

export default function loadArray(
  simpleTable: SimpleTable,
  rows: { [key: string]: unknown }[],
) {
  // This validation doesn't need the database, so it stays at call time.
  if (rows.length === 0) {
    throw new Error(
      "The array is empty. loadArray needs at least one object to infer the column types.",
    );
  }

  queueOp(simpleTable, {
    kind: "barrier",
    method: "loadArray()",
    parameters: { rows },
    execute: () => executeLoadArray(simpleTable, rows),
  });
}

/**
 * Loads the array immediately, without queueing. For use inside a barrier's
 * execute, which runs during a flush: the sync loadArray builder called
 * there would queue an operation for the next flush instead of running now.
 */
export async function executeLoadArray(
  simpleTable: SimpleTable,
  rows: { [key: string]: unknown }[],
) {
  if (simpleTable.connection === undefined) {
    await simpleTable.sdb.start();
    simpleTable.connection = simpleTable.sdb.connection;
  }

  const keys = Object.keys(rows[0]);
  const firstNonNullValue = keys.map((key) =>
    rows.find((obj) => obj[key] !== null && obj[key] !== undefined)
      ?.[key]
  );
  const types: string[] = [];

  // DuckDB data chunks are columnar, so the values are laid out column by
  // column and appended with setColumnValues, avoiding a row-major
  // transposition.
  const columnsData: DuckDBValue[][] = keys.map(
    () => new Array(rows.length),
  );
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    const columnData = columnsData[i];
    const value = firstNonNullValue[i];
    const type = typeof value;
    if (
      type === "symbol" ||
      type === "function"
    ) {
      throw new Error(
        `Type ${type} not supported for ${key}. Value: ${value}`,
      );
    } else if (type === "undefined") {
      // If all values in the column are null or undefined, default to VARCHAR type.
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
          columnData[j] = arrayValue(d as number[]);
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
        if (d === null || d === undefined || Number.isNaN(d)) {
          columnData[j] = null;
        } else {
          columnData[j] = d as DuckDBValue;
        }
      }
    }
  }

  await simpleTable.sdb.customQuery(
    `CREATE OR REPLACE TABLE "${simpleTable.name}"(${
      keys.map((key, i) => `"${key}" ${types[i]}`).join(", ")
    })`,
  );

  const appender = await (simpleTable.connection as DuckDBConnection)
    .createAppender(simpleTable.name);

  const duckDBTypes = types.map((d) => parseDuckDBType(d));
  // The maximum capacity of a DuckDB data chunk is 2048 rows.
  const chunkSize = 2000;
  for (let start = 0; start < rows.length; start += chunkSize) {
    const end = Math.min(start + chunkSize, rows.length);
    const dataChunk = DuckDBDataChunk.create(duckDBTypes, end - start);
    for (let i = 0; i < keys.length; i++) {
      dataChunk.setColumnValues(i, columnsData[i].slice(start, end));
    }
    appender.appendDataChunk(dataChunk);
  }

  appender.flushSync();
}
