import prepareGeometry from "../helpers/prepareGeometry.ts";
import geometryFromJSON from "../helpers/geometryFromJSON.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import { retainRegisteredTables } from "../helpers/tableRegistry.ts";
import queueOp from "../helpers/queueOp.ts";
import { prepareArray } from "./loadArray.ts";
import { DuckDBDataChunk } from "@duckdb/node-api";
import readMutationRows from "../helpers/readMutationRows.ts";
import parseDuckDBType from "../helpers/parseDuckDBType.ts";

type Row = { [key: string]: unknown };

type DataModifier = (
  rows: Row[],
) => Row[] | Promise<Row[]>;

type UpdateWithJSOptions = NonNullable<
  Parameters<SimpleTable["updateWithJS"]>[1]
>;

export default function updateWithJS(
  simpleTable: SimpleTable,
  dataModifier: DataModifier,
  options: UpdateWithJSOptions = {},
): void {
  if (
    options.batchSize !== undefined &&
    (!Number.isInteger(options.batchSize) || options.batchSize < 1)
  ) {
    throw new Error("updateWithJS() batchSize must be a positive integer.");
  }

  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "updateWithJS()",
    parameters: { options },
    execute: () => executeUpdateWithJS(simpleTable, dataModifier, options),
  });
}

async function executeUpdateWithJS(
  simpleTable: SimpleTable,
  dataModifier: DataModifier,
  options: UpdateWithJSOptions,
): Promise<void> {
  const types = await simpleTable.getTypes();
  const geometryColumns = Object.keys(types).filter((key) =>
    types[key].toUpperCase().startsWith("GEOMETRY")
  );
  for (const column of geometryColumns) {
    if (types[column].toUpperCase() !== "GEOMETRY('EPSG:4326')") {
      throw new Error(
        `Column ${JSON.stringify(column)} has CRS ${
          types[column]
        }. Call .reproject("EPSG:4326", { column: ${
          JSON.stringify(column)
        } }) before updateWithJS().`,
      );
    }
    const name = quoteIdentifier(column);
    // Compare the actual binary representation, including dimensions and double
    // precision, rather than assuming GeoJSON serialization is lossless.
    const result = await simpleTable.connection!.runAndReadAll(
      `SELECT count(*) AS invalid FROM ${quoteIdentifier(simpleTable.name)}
       WHERE ${name} IS NOT NULL AND
       ST_AsWKB(${name}) != ST_AsWKB(${
        geometryFromJSON(`ST_AsGeoJSON(${name})`)
      })`,
    );
    if (result.getRows()[0][0] !== 0n) {
      throw new Error(
        `Column ${
          JSON.stringify(column)
        } contains geometry that cannot round-trip through GeoJSON without losing precision or dimensions; unsupported representations cannot be updated with updateWithJS().`,
      );
    }
  }
  for (const key of Object.keys(options.columnTypes ?? {})) {
    if (
      Object.keys(types).some((name) =>
        name.toLowerCase() === key.toLowerCase()
      )
    ) {
      throw new Error(
        `updateWithJS() columnTypes may only declare new columns; ${
          JSON.stringify(key)
        } already exists.`,
      );
    }
  }

  const batchSize = options.batchSize;
  if (batchSize !== undefined) {
    // DuckDB resolves identifiers case-insensitively, and a real rowid column
    // shadows its hidden row identifier used for pagination.
    const conflictingColumn = Object.keys(types).find((column) =>
      ["rowid", "__sda_rowid"].includes(column.toLowerCase())
    );
    if (conflictingColumn !== undefined) {
      throw new Error(
        `The table has a column named "${conflictingColumn}", which conflicts with the internal column used by the batchSize option. Rename it or run updateWithJS without batchSize.`,
      );
    }
  }

  // Rows are pulled in batches by rowid, passed through the modifier, and
  // accumulated in a temporary table, so only one batch of rows is
  // materialized in JS memory at a time.
  const suffix = Math.random().toString(36).slice(2, 10);
  const scratch = simpleTable.sdb.newTable(`updateWithJS_scratch_${suffix}`);
  const accumulator = `updateWithJS_accumulator_${suffix}`;

  try {
    let first = true;
    let lastRowid: bigint | null = null;
    let sawRows = false;
    let outputOffset = 0;
    let inputOffset = 0;

    while (true) {
      const source = await readMutationRows(
        simpleTable.connection!,
        `SELECT ${
          Object.keys(types).map((key) =>
            geometryColumns.includes(key)
              ? `ST_AsGeoJSON(${quoteIdentifier(key)})::VARCHAR AS ${
                quoteIdentifier(key)
              }`
              : quoteIdentifier(key)
          ).join(", ")
        }${batchSize === undefined ? "" : ", rowid AS __sda_rowid"} FROM ${
          quoteIdentifier(simpleTable.name)
        }${lastRowid === null ? "" : ` WHERE rowid > ${lastRowid}`}${
          batchSize === undefined ? "" : ` ORDER BY rowid LIMIT ${batchSize}`
        }`,
      );
      const batch = source.rows;
      const inputCount = batch.length;
      if (inputCount === 0 && sawRows) break;
      sawRows ||= inputCount > 0;
      if (batchSize !== undefined && batch.length > 0) {
        lastRowid = batch[batch.length - 1].__sda_rowid as bigint;
        for (const row of batch) delete row.__sda_rowid;
        source.types.delete("__sda_rowid");
      }

      for (const [index, row] of batch.entries()) {
        for (const key of geometryColumns) {
          row[key] = row[key] === null ? null : JSON.parse(row[key] as string);
          prepareGeometry(row[key], key, inputOffset + index + 1);
        }
      }
      inputOffset += inputCount;
      const modified = await dataModifier(batch);
      if (modified.length === 0) {
        if (!sawRows) return;
        if (batchSize === undefined) break;
        continue;
      }
      const keys = Object.keys(modified[0]);
      for (const key of Object.keys(options.columnTypes ?? {})) {
        if (!keys.includes(key)) {
          throw new Error(
            `Unknown column ${
              JSON.stringify(key)
            } in updateWithJS columnTypes.`,
          );
        }
      }
      const newKeys = keys.filter((key) => !source.types.has(key));
      const added = newKeys.length === 0 ? undefined : prepareArray(
        modified.map((row) =>
          Object.fromEntries(newKeys.map((key) => [key, row[key]]))
        ),
        options.columnTypes,
      );
      const outputGeometry = keys.filter((key) =>
        geometryColumns.includes(key) ||
        (added && added.types[newKeys.indexOf(key)] === "GEOMETRY('EPSG:4326')")
      );
      if (outputGeometry.length && !simpleTable.sdb.spatialLoaded) {
        await simpleTable.sdb.customQuery(
          "INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;",
        );
        simpleTable.sdb.spatialLoaded = true;
      }
      const geometryData = new Map(outputGeometry.map((key) => [
        key,
        modified.map((row, i) =>
          prepareGeometry(row[key], key, outputOffset + i + 1)
        ),
      ]));
      outputOffset += modified.length;
      const columnTypes = keys.map((key) =>
        outputGeometry.includes(key)
          ? parseDuckDBType("VARCHAR")
          : source.types.get(key) ??
            parseDuckDBType(added!.types[newKeys.indexOf(key)])
      );
      await simpleTable.sdb.customQuery(
        `CREATE OR REPLACE TABLE ${quoteIdentifier(scratch.name)} (${
          keys.map((key, i) => `${quoteIdentifier(key)} ${columnTypes[i]}`)
            .join(", ")
        })`,
      );
      const appender = await simpleTable.connection!.createAppender(
        scratch.name,
      );
      try {
        for (let start = 0; start < modified.length; start += 2000) {
          const end = Math.min(start + 2000, modified.length);
          const chunk = DuckDBDataChunk.create(columnTypes, end - start);
          for (let i = 0; i < keys.length; i++) {
            const key = keys[i];
            chunk.setColumnValues(
              i,
              outputGeometry.includes(key)
                ? geometryData.get(key)!.slice(start, end)
                : source.types.has(key)
                ? modified.slice(start, end).map((row) =>
                  source.toNative(row[key], columnTypes[i])
                )
                : added!.columnsData[newKeys.indexOf(key)].slice(start, end),
            );
          }
          appender.appendDataChunk(chunk);
        }
        appender.flushSync();
      } finally {
        appender.closeSync();
      }
      const projection = keys.map((key) =>
        outputGeometry.includes(key)
          ? `${geometryFromJSON(quoteIdentifier(key))} AS ${
            quoteIdentifier(key)
          }`
          : quoteIdentifier(key)
      ).join(", ");
      if (first) {
        await simpleTable.sdb.customQuery(
          `CREATE OR REPLACE TABLE ${
            quoteIdentifier(accumulator)
          } AS SELECT ${projection} FROM ${quoteIdentifier(scratch.name)}`,
        );
        first = false;
      } else {
        await simpleTable.sdb.customQuery(
          `INSERT INTO ${
            quoteIdentifier(accumulator)
          } BY NAME SELECT ${projection} FROM ${quoteIdentifier(scratch.name)}`,
        );
      }
      if (batchSize === undefined || inputCount === 0) break;
    }

    if (first) {
      throw new Error(
        "The dataModifier returned no rows. updateWithJS can't infer the table schema from zero rows.",
      );
    }

    await simpleTable.sdb.customQuery(
      `CREATE OR REPLACE TABLE ${
        quoteIdentifier(simpleTable.name)
      } AS SELECT * FROM ${quoteIdentifier(accumulator)}`,
    );
  } finally {
    await simpleTable.sdb.customQuery(
      `DROP TABLE IF EXISTS ${quoteIdentifier(accumulator)};
DROP TABLE IF EXISTS ${quoteIdentifier(scratch.name)};`,
    );
    retainRegisteredTables(
      simpleTable.sdb,
      (table) => table !== scratch,
    );
  }
}
