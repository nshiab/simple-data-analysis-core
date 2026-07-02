import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function skip(
  simpleTable: SimpleTable,
  nbRowsToSkip: number,
) {
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM "${simpleTable.name}" OFFSET ${nbRowsToSkip} ROWS;`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "skip()",
      parameters: { nbRowsToSkip },
    }),
  );
}
