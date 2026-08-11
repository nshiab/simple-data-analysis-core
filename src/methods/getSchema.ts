import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function getSchema(
  simpleTable: SimpleTable,
) {
  return (await queryDB(
    simpleTable,
    `SELECT
      column_name,
      data_type AS column_type,
      CASE WHEN is_nullable THEN 'YES' ELSE 'NO' END AS "null",
      NULL::VARCHAR AS "key",
      column_default AS "default",
      NULL::VARCHAR AS extra
    FROM duckdb_columns()
    WHERE database_name = current_database()
      AND schema_name = current_schema()
      AND table_name = ?
    ORDER BY column_index`,
    mergeOptions(simpleTable, {
      returnData: true,
      rowsToLog: Infinity,
      table: simpleTable.name,
      method: "getSchema()",
      parameters: {},
      values: [simpleTable.name],
    }),
  )) as {
    [key: string]: string | null;
  }[];
}
