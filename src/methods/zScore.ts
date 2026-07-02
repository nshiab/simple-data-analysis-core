import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function zScore(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
    decimals?: number;
  } = {},
) {
  await queryDB(
    simpleTable,
    zScoreQuery(simpleTable.name, column, newColumn, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "zScore()",
      parameters: { column, newColumn, options },
    }),
  );
}

function zScoreQuery(
  table: string,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
    decimals?: number;
  } = {},
) {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  const partition = categories.length > 0
    ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
    : "";

  const tempQuery = `("${column}"-AVG("${column}") OVER(${partition}))
            /
            STDDEV_POP("${column}") OVER(${partition})`;
  const query = `
    CREATE OR REPLACE TABLE "${table}" AS
    SELECT *, (
        ${
    typeof options.decimals === "number"
      ? `ROUND(${tempQuery}, ${options.decimals})`
      : tempQuery
  }
        
        ) AS ${newColumn},
    FROM "${table}"
    `;

  return query;
}
