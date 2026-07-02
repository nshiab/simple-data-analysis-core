import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function quantiles(
  simpleTable: SimpleTable,
  values: string,
  nbQuantiles: number,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  await queryDB(
    simpleTable,
    quantilesQuery(simpleTable.name, values, nbQuantiles, newColumn, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "quantiles()",
      parameters: {
        values,
        nbQuantiles,
        newColumn,
        options,
      },
    }),
  );
}

function quantilesQuery(
  table: string,
  values: string,
  nbQuantiles: number,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];

  const partition = categories.length === 0
    ? ""
    : `PARTITION BY ${categories.map((d) => `"${d}"`).join(",")} `;

  const query =
    `CREATE OR REPLACE TABLE "${table}" AS SELECT *, ntile(${nbQuantiles}) OVER (${partition}ORDER BY "${values}") AS "${newColumn}"
    FROM "${table}"`;

  return query;
}
