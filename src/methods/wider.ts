import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function wider(
  simpleTable: SimpleTable,
  columnsFrom: string,
  valuesFrom: string,
) {
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM (PIVOT "${simpleTable.name}" ON "${columnsFrom}" USING sum("${valuesFrom}"));`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "wider()",
      parameters: { columnsFrom, valuesFrom },
    }),
  );
}
