import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function cloneColumn(
  simpleTable: SimpleTable,
  originalColumn: string,
  newColumn: string,
) {
  const types = await simpleTable.getTypes();

  await queryDB(
    simpleTable,
    cloneColumnQuery(simpleTable.name, originalColumn, newColumn, types),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "cloneColumn()",
      parameters: { originalColumn, newColumn },
    }),
  );
}

function cloneColumnQuery(
  table: string,
  originalColumn: string,
  newColumn: string,
  types: { [key: string]: string },
) {
  let query = "";

  const originalColumnType = types[originalColumn];

  if (originalColumnType) {
    query +=
      `ALTER TABLE "${table}" ADD COLUMN "${newColumn}" ${originalColumnType};
        UPDATE "${table}" SET "${newColumn}" = "${originalColumn}"`;
  } else {
    throw new Error(`Can't find type of ${originalColumn}`);
  }

  return query;
}
