import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function sort(
  simpleTable: SimpleTable,
  order: { [key: string]: "asc" | "desc" } | null = null,
  options: {
    lang?: { [key: string]: string };
  } = {},
) {
  await queryDB(
    simpleTable,
    sortQuery(simpleTable.name, order, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "sort()",
      parameters: { order, options },
    }),
  );
}

function sortQuery(
  table: string,
  order: { [key: string]: "asc" | "desc" } | null,
  options: {
    lang?: { [key: string]: string };
  } = {},
) {
  let query = `CREATE OR REPLACE TABLE "${table}" AS SELECT * FROM "${table}"
    ORDER BY`;

  if (order === null) {
    query += " ALL; ";
  } else {
    for (const column of Object.keys(order)) {
      if (options.lang && options.lang[column]) {
        query += `\n"${column}" COLLATE ${options.lang[column]} ${
          order[
            column
          ].toUpperCase()
        },`;
      } else {
        query += `\n"${column}" ${order[column].toUpperCase()},`;
      }
    }
  }

  return query.slice(0, query.length - 1);
}
