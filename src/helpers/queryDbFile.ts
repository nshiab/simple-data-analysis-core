import type SimpleDB from "../class/SimpleDB.ts";
import queryDB from "./queryDB.ts";
import mergeOptions from "./mergeOptions.ts";

/** Executes generated database-file SQL without rewriting paths or metadata. */
export default function queryDbFile(
  sdb: SimpleDB,
  sql: string,
  options: { returnData?: boolean } = {},
) {
  return queryDB(
    sdb,
    sql,
    mergeOptions(sdb, {
      table: null,
      method: "database file operation",
      parameters: null,
      returnData: options.returnData,
      noClean: true,
    }),
  );
}
