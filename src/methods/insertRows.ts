import mergeOptions from "../helpers/mergeOptions.ts";
import parseValue from "../helpers/parseValue.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function insertRows(
  simpleTable: SimpleTable,
  rows: { [key: string]: unknown }[],
) {
  if (await simpleTable.sdb.hasTable(simpleTable.name)) {
    await queryDB(
      simpleTable,
      insertRowsQuery(simpleTable.name, rows),
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "insertRows()",
        parameters: { rows },
      }),
    );
  } else {
    await simpleTable.loadArray(rows);
  }
}

function insertRowsQuery(
  table: string,
  rows: { [key: string]: unknown }[],
) {
  const columns = Object.keys(rows[0]);

  let query = `INSERT INTO "${table}" (${
    columns.map((d) => `"${d}"`).join(", ")
  })
        VALUES`;

  for (const row of rows) {
    const values = Object.values(row);
    query += `\n(${values.map((d) => parseValue(d)).join(", ")}),`;
  }

  return query.slice(0, query.length - 1);
}
