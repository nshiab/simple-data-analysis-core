import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function right(
  simpleTable: SimpleTable,
  column: string,
  numberOfCharacters: number,
) {
  await queryDB(
    simpleTable,
    `UPDATE "${simpleTable.name}" SET "${column}" = RIGHT("${column}", ${numberOfCharacters})`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "right()",
      parameters: { column, numberOfCharacters },
    }),
  );
}
