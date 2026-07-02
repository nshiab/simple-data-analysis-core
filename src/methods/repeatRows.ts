import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";

import type SimpleTable from "../class/SimpleTable.ts";

export default async function repeatRows(
  simpleTable: SimpleTable,
  column: string,
  options: { index?: string } = {},
) {
  await queryDB(
    simpleTable,
    repeatRowsQuery(simpleTable.name, column, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "repeatRows()",
      parameters: { column, options },
    }),
  );
}

function repeatRowsQuery(
  table: string,
  column: string,
  options: {
    index?: string;
  } = {},
) {
  if (options.index) {
    return `CREATE OR REPLACE TABLE "${table}" AS SELECT *, UNNEST(range(CAST("${column}" AS BIGINT))) AS "${options.index}" FROM "${table}"`;
  } else {
    return `CREATE OR REPLACE TABLE "${table}" AS SELECT * EXCLUDE (_index) FROM (SELECT *, UNNEST(range(CAST("${column}" AS BIGINT))) AS _index FROM "${table}")`;
  }
}
