import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function proportionsHorizontal(
  simpleTable: SimpleTable,
  columns: string[],
  options: {
    suffix?: string;
    decimals?: number;
  } = {},
) {
  await queryDB(
    simpleTable,
    proportionsHorizontalQuery(simpleTable.name, columns, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "proportionsHorizontal()",
      parameters: {
        columns,
        options,
      },
    }),
  );
}

function proportionsHorizontalQuery(
  table: string,
  columns: string[],
  options: {
    suffix?: string;
    decimals?: number;
  } = {},
) {
  let query = `CREATE OR REPLACE TABLE "${table}" AS SELECT *,`;

  for (const col of columns) {
    const tempQuery = `"${col}" / (${
      columns.map((d) => `"${d}"`).join(" + ")
    })`;
    if (typeof options.decimals === "number") {
      query += ` ROUND(${tempQuery}, ${options.decimals})`;
    } else {
      query += ` ${tempQuery}`;
    }
    query += ` AS "${col}${options.suffix ?? "Perc"}",`;
  }

  query += `FROM "${table}"`;

  return query;
}
