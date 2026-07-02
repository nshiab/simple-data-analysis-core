import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function left(
  simpleTable: SimpleTable,
  column: string,
  numberOfCharacters: number,
) {
  await queryDB(
    simpleTable,
    `UPDATE "${simpleTable.name}" SET "${column}" = LEFT("${column}", ${numberOfCharacters})`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "left()",
      parameters: { column, numberOfCharacters },
    }),
  );
}
