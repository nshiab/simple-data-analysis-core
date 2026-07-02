import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function upper(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  await queryDB(
    simpleTable,
    upperQuery(simpleTable.name, stringToArray(columns)),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "upper()",
      parameters: { columns },
    }),
  );
}

function upperQuery(table: string, columns: string[]) {
  let query = "";

  for (const column of columns) {
    query += `\nUPDATE "${table}" SET "${column}" = UPPER("${column}");`;
  }

  return query;
}
