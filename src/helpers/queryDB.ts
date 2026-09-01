import type { DuckDBValue as NativeDuckDBValue } from "@duckdb/node-api";
import SimpleTable from "../class/SimpleTable.ts";
import SimpleDB from "../class/SimpleDB.ts";
import cleanSQL from "./cleanSQL.ts";
import flushAllTables from "./flushAllTables.ts";
import { recordCacheTableAccess } from "./cacheTableDependencies.ts";

/** @internal DuckDB owns this type; retain its exact binding contract without re-exporting it. */
type DuckDBValue = NativeDuckDBValue;

/**
 * Executes SQL for a table or database after flushing all queued operations.
 * Starts the database on first use and applies its SQL logging settings.
 * Extension authors can construct `options` with `mergeOptions()`.
 *
 * @param simple - The table or database that owns the query.
 * @param query - The SQL statement to execute.
 * @param options - Query execution and diagnostic settings.
 * @param options.table - The table name used for diagnostics, or `null`.
 * @param options.method - The calling method used for diagnostics, or `null`.
 * @param options.parameters - Arguments included in error diagnostics, or `null`.
 * @param options.rowsToLog - The caller's row-display limit, retained for compatibility.
 * @param options.charsToLog - The caller's per-cell display limit, retained for compatibility.
 * @param options.returnData - Whether to convert and return the result rows.
 * @param options.values - DuckDB-native values bound to SQL placeholders, in order.
 * @param options.noClean - Whether to preserve the SQL text without cleaning it.
 * @returns Converted rows when `returnData` is true, otherwise `null`.
 *
 * @example
 * ```ts
 * import { mergeOptions, queryDB, quoteIdentifier } from "@nshiab/simple-data-analysis-core/helpers";
 *
 * await table.loadArray([{ answer: 0 }]).run();
 * const query = `UPDATE ${quoteIdentifier(table.name)} SET answer = ?`;
 * await queryDB(table, query, mergeOptions(table, {
 *   table: table.name,
 *   method: "example()",
 *   parameters: null,
 *   values: [42],
 * }));
 * await table.log();
 * ```
 */
export default async function queryDB(
  simple: SimpleTable | SimpleDB,
  query: string,
  options: {
    table: string | null;
    method: string | null;
    parameters: { [key: string]: unknown } | null;
    rowsToLog: number;
    charsToLog: number | undefined;
    returnData: boolean;
    values?: DuckDBValue[];
    noClean?: boolean;
  },
): Promise<
  | {
    [key: string]: unknown;
  }[]
  | null
> {
  if (simple instanceof SimpleTable) {
    recordCacheTableAccess(simple);
  }
  const sdb = simple instanceof SimpleTable ? simple.sdb : simple;
  if (sdb.lifecycleState === "closed") {
    throw new Error(
      `${
        options.method ?? "The query"
      } cannot run because its SimpleDB is closed.`,
    );
  }
  if (simple instanceof SimpleDB && simple.connection === undefined) {
    await simple.start();
  } else if (
    simple instanceof SimpleTable &&
    simple.connection === undefined
  ) {
    await simple.sdb.start();
    simple.db = simple.sdb.db;
    simple.connection = simple.sdb.connection;
  }
  if (simple.connection === undefined) {
    throw new Error("simple.connection is undefined");
  }

  // Observing executes: any query touching the database first flushes the
  // operations queued by sync builder methods, preserving program order.
  await flushAllTables(simple instanceof SimpleTable ? simple.sdb : simple);

  if (options.noClean !== true) {
    query = cleanSQL(query);
  }

  const executionOptions = {
    ...options,
    logSQL: sdb.logSQL,
    explainSQL: sdb.explainSQL,
  };

  if (options.returnData) {
    const data = await simple.runQuery(
      query,
      simple.connection,
      true,
      executionOptions,
    );
    if (data === null) {
      throw new Error("data is null");
    }
    return data;
  } else {
    await simple.runQuery(query, simple.connection, false, executionOptions);
    return null;
  }
}
