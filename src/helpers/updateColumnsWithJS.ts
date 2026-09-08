import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "./quoteIdentifier.ts";
import readMutationRows from "./readMutationRows.ts";
import { retainRegisteredTables } from "./tableRegistry.ts";

/**
 * Generates columns from selected input columns, keeping other SQL values in
 * DuckDB. Call from an asynchronous extension barrier. The callback must return
 * one row per input row in the same order; only the declared output columns are
 * stored. Existing output columns are replaced, with types inferred from the
 * generated values. The original table is replaced only after staging succeeds.
 *
 * @param table - Table to enrich.
 * @param inputColumns - Columns available to the callback.
 * @param outputColumns - Generated columns to add or replace.
 * @param generate - Produces one result per input row, in input order.
 * @returns Resolves after merging the generated columns into the table.
 * @example
 * ```ts
 * queueAsyncBarrier(table, {
 *   method: "label()",
 *   parameters: null,
 *   execute: () => updateColumnsWithJS(table, ["name"], ["label"], async (rows) =>
 *     rows.map((row) => ({ label: String(row.name).toUpperCase() }))),
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
): Promise<void> {
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
  if (
    Object.values(types).some((type) =>
      type.toUpperCase().startsWith("GEOMETRY")
    )
  ) {
    throw new Error(
      "JavaScript column updates don't work with tables containing geometries.",
    );
  }
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const id = `__sda_id_${suffix}`;
  const snapshot = `__sda_source_${suffix}`;
  const staged = table.sdb.newTable(`__sda_generated_${suffix}`);
  const q = quoteIdentifier;
  try {
    // A SQL snapshot gives every row a stable identity, including duplicate rows
    // and user columns named rowid. No untouched values cross the JS boundary.
    await table.sdb.customQuery(
      `CREATE TEMP TABLE ${q(snapshot)} AS SELECT *, row_number() OVER () AS ${
        q(id)
      } FROM ${q(table.name)}`,
    );
    const { rows } = await readMutationRows(
      table.connection!,
      `SELECT ${q(id)}, ${inputColumns.map(q).join(", ")} FROM ${
        q(snapshot)
      } ORDER BY ${q(id)}`,
    );
    const ids = rows.map((row) => String(row[id]));
    for (const row of rows) delete row[id];
    const generated = await generate(rows);
    if (generated.length !== ids.length) {
      throw new Error("Column generation must return one row per input row.");
    }
    if (generated.length === 0) return;
    await staged.loadArray(generated.map((row, i) => ({
      ...Object.fromEntries(outputColumns.map((name) => [name, row[name]])),
      [id]: ids[i],
    }))).run();
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
      };`,
    );
    retainRegisteredTables(table.sdb, (item) => item !== staged);
  }
}
