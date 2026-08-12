import SimpleTable from "../class/SimpleTable.ts";
import SimpleDB from "../class/SimpleDB.ts";
import cleanSQL from "./cleanSQL.ts";
import flushAllTables from "./flushAllTables.ts";
import type { DuckDBValue } from "@duckdb/node-api";

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
    dataTransport?: "direct" | "file";
    rejectGeometry?: boolean;
  },
): Promise<
  | {
    [key: string]: unknown;
  }[]
  | null
> {
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
    dataTransport: options.returnData
      ? options.dataTransport ?? sdb.dataTransport
      : undefined,
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
