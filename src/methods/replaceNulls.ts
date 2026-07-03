import mergeOptions from "../helpers/mergeOptions.ts";
import parseValue from "../helpers/parseValue.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function replaceNulls(
  simpleTable: SimpleTable,
  columns: "all" | string | string[],
  value: number | string | Date | boolean,
) {
  const columnList = columns === "all"
    ? await simpleTable.getColumns()
    : stringToArray(columns);
  await queryDB(
    simpleTable,
    replaceNullsQuery(simpleTable.name, columnList, value),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "replaceNulls()",
      parameters: { columns, value },
    }),
  );
}

function replaceNullsQuery(
  table: string,
  columns: string[],
  value: number | string | Date | boolean,
) {
  let query = "";
  const valueParsed = parseValue(value);
  for (const column of columns) {
    query +=
      `UPDATE "${table}" SET "${column}" = ${valueParsed} WHERE "${column}" IS NULL;`;
  }

  return query;
}
