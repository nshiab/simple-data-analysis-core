import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function longer(
  simpleTable: SimpleTable,
  columns: string[],
  columnsTo: string,
  valuesTo: string,
) {
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * FROM (
            FROM "${simpleTable.name}" UNPIVOT INCLUDE NULLS (
            "${valuesTo}"
            for "${columnsTo}" in (${columns.map((d) => `"${d}"`).join(", ")})
            )
        )`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "longer()",
      parameters: { columns, columnsTo, valuesTo },
    }),
  );
}
