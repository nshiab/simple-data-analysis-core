import type SimpleTable from "../class/SimpleTable.ts";
import type { PreparedNumericFeatures } from "./prepareNumericFeatures.ts";
import foldIdentifier from "./foldIdentifier.ts";
import mergeOptions from "./mergeOptions.ts";
import queryDB from "./queryDB.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

type PublicationOutput = {
  /** Raw output-column name. */
  name: string;
  /** Trusted internal SQL evaluated with the prepared relation aliased as p. */
  expression: string;
  /** Raw source-column name to replace in its original position. */
  replace?: string;
};

type PublicationResult = {
  /** Raw relation name joined to the prepared rows. */
  relation: string;
  /** Raw row-identity column in the result relation. */
  rowIdColumn: string;
};

/**
 * Atomically publishes validated algorithm outputs from a prepared numeric
 * feature snapshot. New outputs are appended, while replacements retain the
 * source column's position. Existing native DuckDB indexes are recreated in
 * the same transaction because CREATE OR REPLACE drops them.
 *
 * Output expressions are trusted internal SQL. They may reference `p`, the
 * prepared relation alias, and `r` when a result relation is supplied. The
 * consumer must fully compute and validate one result row per prepared row
 * before calling this helper, and remains responsible for scratch cleanup.
 */
export default async function publishPreparedColumns(
  table: SimpleTable,
  prepared: Pick<
    PreparedNumericFeatures,
    | "relation"
    | "rowIdColumn"
    | "sourceColumns"
    | "sourceTemporary"
  >,
  options: {
    method: string;
    parameters: { [key: string]: unknown } | null;
    outputs: PublicationOutput[];
    result?: PublicationResult;
  },
): Promise<void> {
  validateOutputs(prepared.sourceColumns, options.outputs);

  const connection = table.connection!;
  const q = quoteIdentifier;
  const source = q(table.name);
  const tableDetails = (await connection.runAndReadAll(
    `SELECT table_oid FROM duckdb_tables()
     WHERE translate(table_name, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz') = $1
       AND schema_name = current_schema()
       AND database_name IN (current_database(), 'temp')
       AND temporary = $2
     LIMIT 1`,
    [foldIdentifier(table.name), prepared.sourceTemporary],
  )).getRowsJS()[0];
  if (tableDetails === undefined) {
    throw new Error(`${options.method} requires a materialized source table.`);
  }
  const tableOid = tableDetails[0];
  if (typeof tableOid !== "number" && typeof tableOid !== "bigint") {
    throw new Error(`${options.method} could not identify the source table.`);
  }

  const indexes = (await connection.runAndReadAll(
    "SELECT sql FROM duckdb_indexes() WHERE table_oid = $1 ORDER BY index_name",
    [tableOid],
  )).getRowsJS().map((row) => String(row[0]));
  const replacements = new Map(
    options.outputs.filter((output) => output.replace !== undefined).map((
      output,
    ) => [foldIdentifier(output.replace!), output]),
  );
  const select = prepared.sourceColumns.map((column) => {
    const replacement = replacements.get(foldIdentifier(column));
    return replacement === undefined
      ? `p.${q(column)}`
      : `${replacement.expression} AS ${q(column)}`;
  });
  for (const output of options.outputs) {
    if (output.replace === undefined) {
      select.push(`${output.expression} AS ${q(output.name)}`);
    }
  }
  const resultJoin = options.result === undefined
    ? ""
    : ` JOIN ${q(options.result.relation)} r
      ON p.${q(prepared.rowIdColumn)} = r.${q(options.result.rowIdColumn)}`;

  await connection.run("BEGIN TRANSACTION");
  try {
    await queryDB(
      table,
      `CREATE OR REPLACE ${
        prepared.sourceTemporary ? "TEMP " : ""
      }TABLE ${source} AS
       SELECT ${select.join(", ")}
       FROM ${q(prepared.relation)} p${resultJoin}
       ORDER BY p.${q(prepared.rowIdColumn)}`,
      mergeOptions(table, {
        table: table.name,
        method: options.method,
        parameters: options.parameters,
        noClean: true,
      }),
    );
    for (const sql of indexes) {
      try {
        await connection.run(sql);
      } catch (error) {
        const detail = error instanceof Error ? ` ${error.message}` : "";
        throw new Error(
          `${options.method} could not restore an existing DuckDB index while publishing its output. Remove or rebuild indexes that do not support the output column types.${detail}`,
          { cause: error },
        );
      }
    }
    await connection.run("COMMIT");
  } catch (error) {
    try {
      await connection.run("ROLLBACK");
    } catch {
      // DuckDB may already abort the transaction after an index-build error.
      // Preserve the publication error that explains why the operation failed.
    }
    // UNIQUE violations can be deferred until COMMIT, which may also fail for
    // unrelated reasons. Preserve that diagnostic instead of blaming indexes.
    throw error;
  }
}

function validateOutputs(
  sourceColumns: string[],
  outputs: PublicationOutput[],
): void {
  const outputNames = new Set<string>();
  const replacements = new Set<string>();
  for (const output of outputs) {
    const outputName = foldIdentifier(output.name);
    if (outputNames.has(outputName)) {
      throw new Error(
        `Internal publication received duplicate output column ${
          quoteIdentifier(output.name)
        }.`,
      );
    }
    outputNames.add(outputName);
    if (output.replace === undefined) {
      if (
        sourceColumns.some((column) => foldIdentifier(column) === outputName)
      ) {
        throw new Error(
          `Internal publication cannot append existing column ${
            quoteIdentifier(output.name)
          }.`,
        );
      }
      continue;
    }
    const replacement = foldIdentifier(output.replace);
    if (outputName !== replacement) {
      throw new Error(
        `Internal publication output ${
          quoteIdentifier(output.name)
        } must match its replacement column ${
          quoteIdentifier(output.replace)
        }.`,
      );
    }
    if (
      !sourceColumns.some((column) => foldIdentifier(column) === replacement)
    ) {
      throw new Error(
        `Internal publication cannot replace missing column ${
          quoteIdentifier(output.replace)
        }.`,
      );
    }
    if (replacements.has(replacement)) {
      throw new Error(
        `Internal publication received duplicate replacement column ${
          quoteIdentifier(output.replace)
        }.`,
      );
    }
    replacements.add(replacement);
  }
}
