import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function unnest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
) {
  await queryDB(
    simpleTable,
    unnestQuery(simpleTable.name, column, separator),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "unnest()",
      parameters: { column, separator },
    }),
  );
}

function unnestQuery(
  table: string,
  column: string,
  separator: string,
) {
  const query = `CREATE OR REPLACE TABLE "${table}" AS
SELECT
  * EXCLUDE "${column}",
  TRIM(UNNEST(SPLIT("${column}", '${separator}'))) AS "${column}"
FROM "${table}";`;

  return query;
}
