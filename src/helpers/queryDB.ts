import SimpleTable from "../class/SimpleTable.ts";
import SimpleDB from "../class/SimpleDB.ts";
import cleanSQL from "./cleanSQL.ts";
import flushAllTables from "./flushAllTables.ts";

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
    debug: boolean;
    noClean?: boolean;
  },
): Promise<
  | {
    [key: string]: unknown;
  }[]
  | null
> {
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

  if (options.debug) {
    // We beautify it a little bit
    if (query.at(-1) !== ";") {
      query += ";";
    }
    if (query.includes("\n")) {
      query = query
        .trim()
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line !== "" && line !== ";")
        .join("\n");
    }
    console.log(query);
  }

  if (options.returnData) {
    const data = await simple.runQuery(
      query,
      simple.connection,
      true,
      options,
    );
    if (data === null) {
      throw new Error("data is null");
    }
    return data;
  } else {
    await simple.runQuery(query, simple.connection, false, options);
    return null;
  }
}
