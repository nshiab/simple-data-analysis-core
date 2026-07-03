import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function selectColumns(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT ${
      stringToArray(
        columns,
      )
        .map((d) => `"${d}"`)
        .join(", ")
    } FROM "${simpleTable.name}"`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "selectColumns()",
      parameters: { columns },
    }),
  );
}
