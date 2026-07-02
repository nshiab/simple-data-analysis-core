import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function removeDuplicates(
  simpleTable: SimpleTable,
  options: {
    on?: string | string[];
  } = {},
) {
  await queryDB(
    simpleTable,
    removeDuplicatesQuery(simpleTable.name, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "removeDuplicates()",
      parameters: { options },
    }),
  );
}

function removeDuplicatesQuery(
  table: string,
  options: {
    on?: string | string[];
  } = {},
) {
  const columnsOn = options.on ? stringToArray(options.on) : null;
  let distinct;
  if (columnsOn) {
    distinct = `DISTINCT ON(${columnsOn.map((d) => `"${d}"`).join(",")}) *`;
  } else {
    distinct = "DISTINCT *";
  }

  return `CREATE OR REPLACE TABLE "${table}" AS SELECT ${distinct} FROM "${table}";`;
}
