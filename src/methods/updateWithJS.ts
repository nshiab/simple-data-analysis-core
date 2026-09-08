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

type UpdateWithJSOptions = { batchSize?: number };

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
  // Geometry columns are typed as GEOMETRY('<crs>'), not a bare "GEOMETRY".
  if (
    Object.values(types).some((d) => d.toUpperCase().startsWith("GEOMETRY"))
  ) {
    throw new Error(
      "updateWithJS doesn't work with tables containing geometries.",
    );
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

    while (true) {
      const source = await readMutationRows(
        simpleTable.connection!,
        `SELECT *${
          batchSize === undefined ? "" : ", rowid AS __sda_rowid"
        } FROM ${quoteIdentifier(simpleTable.name)}${
          lastRowid === null ? "" : ` WHERE rowid > ${lastRowid}`
        }${
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

      const modified = await dataModifier(batch);
      if (modified.length === 0) {
        if (!sawRows) return;
        if (batchSize === undefined) break;
        continue;
      }
      const keys = Object.keys(modified[0]);
      const newKeys = keys.filter((key) => !source.types.has(key));
      const added = newKeys.length === 0
        ? undefined
        : prepareArray(modified.map((row) =>
          Object.fromEntries(newKeys.map((key) => [key, row[key]]))
        ));
      const columnTypes = keys.map((key) =>
        source.types.get(key) ??
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
              source.types.has(key)
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
      if (first) {
        await simpleTable.sdb.customQuery(
          `CREATE OR REPLACE TABLE ${
            quoteIdentifier(accumulator)
          } AS SELECT * FROM ${quoteIdentifier(scratch.name)}`,
        );
        first = false;
      } else {
        await simpleTable.sdb.customQuery(
          `INSERT INTO ${quoteIdentifier(accumulator)} BY NAME SELECT * FROM ${
            quoteIdentifier(scratch.name)
          }`,
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
