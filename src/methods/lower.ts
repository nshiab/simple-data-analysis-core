import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function lower(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  await queryDB(
    simpleTable,
    lowerQuery(simpleTable.name, stringToArray(columns)),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "lower()",
      parameters: { columns },
    }),
  );
}

function lowerQuery(table: string, columns: string[]) {
  let query = "";

  for (const column of columns) {
    query += `\nUPDATE "${table}" SET "${column}" = LOWER("${column}");`;
  }

  return query;
}
