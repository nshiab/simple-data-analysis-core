import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function splitExtract(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  index: number,
  newColumn: string,
) {
  await queryDB(
    simpleTable,
    `${
      column === newColumn
        ? ""
        : `ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" VARCHAR;`
    }
      UPDATE "${simpleTable.name}" SET "${newColumn}" = SPLIT_PART("${column}", '${separator}', ${
      index + 1
    })`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "splitExtract()",
      parameters: { column, separator, index, newColumn },
    }),
  );
}
