import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function filter(
  simpleTable: SimpleTable,
  conditions: string,
) {
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT *
        FROM "${simpleTable.name}"
        WHERE ${conditions}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "filter()",
      parameters: { conditions },
    }),
  );
}
