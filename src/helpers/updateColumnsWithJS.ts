import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import readMutationRows from "./readMutationRows.ts";
import { retainRegisteredTables } from "./tableRegistry.ts";

/**
 * Generates columns from selected input columns, keeping other SQL values in
 * DuckDB. Call from an asynchronous extension barrier. The callback must return
 * one row per input row in the same order; only the declared output columns are
 * stored. Existing output columns are replaced, with types inferred from the
 * generated values. Generation runs sequentially in bounded batches (1,000 rows
 * by default); callbacks must not depend on receiving the whole table. Non-null
 * output types must agree across batches. All-null batches defer type inference.
 * Only one batch of inputs and outputs is retained by this helper in JavaScript;
 * callers must also bound their own buffering. Reads finish before callbacks or
 * writes use the shared connection. The original table is replaced only after
 * staging succeeds. Empty tables are unchanged and do not invoke the callback;
 * outputs that remain null in every batch use VARCHAR.
 *
 * Untouched geometry columns remain in DuckDB, preserving their values, types
 * and CRS without GeoJSON conversion. Geometry columns cannot be selected as
 * inputs or overwritten as outputs; use updateWithJS() for editable GeoJSON.
 * This SQL-only preservation path accepts any source CRS.
 *
 * @param table - Table to enrich.
 * @param inputColumns - Columns available to the callback.
 * @param outputColumns - Generated columns to add or replace.
 * @param generate - Produces one result per input row, in input order.
 * @param options - Controls the maximum rows read, generated, and staged at once.
 * @returns Resolves after merging the generated columns into the table.
 * @example
 * ```ts
 * queueAsyncBarrier(table, {
 *   method: "label()",
 *   parameters: null,
 *   execute: () => updateColumnsWithJS(table, ["name"], ["label"], async (rows) =>
 *     rows.map((row) => ({ label: String(row.name).toUpperCase() })),
 *     { batchSize: 500 }),
 * });
 * await table.log();
 * ```
 */
export default async function updateColumnsWithJS(
  table: SimpleTable,
  inputColumns: string[],
  outputColumns: string[],
  generate: (
    rows: { [key: string]: unknown }[],
  ) => Promise<{ [key: string]: unknown }[]>,
  options: {
    /** Maximum rows per callback and transfer batch. Defaults to 1,000.
     * @example
     * ```ts
     * { batchSize: 500 }
     * ```
     */
    batchSize?: number;
  } = {},
): Promise<void> {
  const batchSize = options.batchSize ?? 1000;
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error("batchSize must be a positive safe integer.");
  }
  if (inputColumns.length === 0 || outputColumns.length === 0) {
    throw new Error("Input and output columns must not be empty.");
  }
  if (
    new Set(outputColumns.map((name) => name.toLowerCase())).size !==
      outputColumns.length
  ) {
    throw new Error("Output columns must be unique.");
  }
  const types = await table.getTypes();
  for (const [name, type] of Object.entries(types)) {
    if (
      type.toUpperCase().startsWith("GEOMETRY") &&
      [...inputColumns, ...outputColumns].some((column) =>
        column.toLowerCase() === name.toLowerCase()
      )
    ) {
      throw new Error(
        `Geometry column ${
          JSON.stringify(name)
        } cannot be an input or output of updateColumnsWithJS(); use updateWithJS() for editable GeoJSON.`,
      );
    }
  }
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const id = `__sda_id_${suffix}`;
  const snapshot = `__sda_source_${suffix}`;
  const staged = table.sdb.newTable(`__sda_generated_${suffix}`);
  const batch = table.sdb.newTable(`__sda_batch_${suffix}`);
  const q = quoteIdentifier;
  try {
    // A SQL snapshot gives every row a stable identity, including duplicate rows
    // and user columns named rowid. No untouched values cross the JS boundary.
    await table.sdb.customQuery(
      `CREATE TEMP TABLE ${q(snapshot)} AS SELECT *, row_number() OVER () AS ${
        q(id)
      } FROM ${q(table.name)}`,
    );
    const knownTypes = new Map<string, string>();
    let lastId = "0";
    let hasRows = false;
    while (true) {
      const upperId = BigInt(lastId) + BigInt(batchSize);
      const { rows } = await readMutationRows(
        table.connection!,
        `SELECT ${q(id)}, ${inputColumns.map(q).join(", ")} FROM ${
          q(snapshot)
        } WHERE ${q(id)} > ${lastId} AND ${q(id)} <= ${upperId}
        ORDER BY ${q(id)} LIMIT ${batchSize}`,
      );
      if (rows.length === 0) break;
      const ids = rows.map((row) => String(row[id]));
      lastId = ids[ids.length - 1];
      for (const row of rows) delete row[id];
      const generated = await generate(rows);
      if (generated.length !== ids.length) {
        throw new Error("Column generation must return one row per input row.");
      }
      await batch.loadArray(generated.map((row, i) => ({
        ...Object.fromEntries(outputColumns.map((name) => [name, row[name]])),
        [id]: ids[i],
      }))).run();
      const batchTypes = await batch.getTypes();
      for (const name of outputColumns) {
        const nonNull = generated.some((row) =>
          row[name] !== null && row[name] !== undefined
        );
        if (!nonNull) continue;
        const previous = knownTypes.get(name);
        const current = batchTypes[name];
        if (previous !== undefined && previous !== current) {
          throw new Error(
            `Generated column ${
              JSON.stringify(name)
            } changed type from ${previous} to ${current}.`,
          );
        }
        if (previous === undefined) {
          knownTypes.set(name, current);
          if (hasRows) {
            await table.sdb.customQuery(
              `ALTER TABLE ${q(staged.name)} ALTER COLUMN ${
                q(name)
              } TYPE ${current} USING NULL`,
            );
          }
        }
      }
      if (!hasRows) {
        await table.sdb.customQuery(
          `CREATE TEMP TABLE ${q(staged.name)} AS SELECT * FROM ${
            q(batch.name)
          }`,
        );
        hasRows = true;
      } else {
        await table.sdb.customQuery(
          `INSERT INTO ${q(staged.name)} SELECT * FROM ${q(batch.name)}`,
        );
      }
    }
    if (!hasRows) return;
    const outputs = new Map(
      outputColumns.map((name) => [name.toLowerCase(), name]),
    );
    const columns = Object.keys(types).map((name) => {
      const replacement = outputs.get(name.toLowerCase());
      return replacement === undefined
        ? `original.${q(name)}`
        : `generated.${q(replacement)} AS ${q(name)}`;
    });
    const existing = new Set(
      Object.keys(types).map((name) => name.toLowerCase()),
    );
    for (const name of outputColumns) {
      if (!existing.has(name.toLowerCase())) {
        columns.push(`generated.${q(name)}`);
      }
    }
    await table.sdb.customQuery(
      `CREATE OR REPLACE TABLE ${q(table.name)} AS SELECT ${
        columns.join(", ")
      } FROM ${q(snapshot)} original JOIN ${
        q(staged.name)
      } generated ON original.${q(id)} = CAST(generated.${
        q(id)
      } AS BIGINT) ORDER BY original.${q(id)}`,
    );
  } finally {
    await table.sdb.customQuery(
      `DROP TABLE IF EXISTS ${q(snapshot)}; DROP TABLE IF EXISTS ${
        q(staged.name)
      }; DROP TABLE IF EXISTS ${q(batch.name)};`,
    );
    retainRegisteredTables(
      table.sdb,
      (item) => item !== staged && item !== batch,
    );
  }
}
