import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function renameColumns(
  simpleTable: SimpleTable,
  names: { [key: string]: string },
) {
  const oldNames = Object.keys(names);
  const newNames = Object.values(names);

  await queryDB(
    simpleTable,
    renameColumnQuery(simpleTable.name, oldNames, newNames),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "renameColumns()",
      parameters: { names },
    }),
  );
}

function renameColumnQuery(
  table: string,
  oldColumns: string[],
  newColumns: string[],
) {
  let query = "";
  for (let i = 0; i < oldColumns.length; i++) {
    query += `ALTER TABLE "${table}" RENAME COLUMN "${oldColumns[i]}" TO "${
      newColumns[i]
    }";\n`;
  }
  return query;
}
