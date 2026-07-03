import mergeOptions from "../helpers/mergeOptions.ts";
import stringToArray from "../helpers/stringToArray.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function nest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  categories: string | string[],
) {
  await queryDB(
    simpleTable,
    nestQuery(simpleTable.name, column, separator, categories),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "nest()",
      parameters: { column, separator, categories },
    }),
  );
}

function nestQuery(
  table: string,
  column: string,
  separator: string,
  categories: string | string[],
) {
  const cats = stringToArray(categories);
  const groupBy = cats.map((d) => `"${d}"`).join(", ");
  const selectColumns = `${groupBy}, `;
  const orderBy = `\nORDER BY ${cats.map((d) => `"${d}" ASC`).join(", ")}`;

  const query = `CREATE OR REPLACE TABLE "${table}" AS
SELECT
  ${selectColumns}STRING_AGG("${column}", '${separator}') AS "${column}"
FROM "${table}"
GROUP BY ${groupBy}${orderBy};`;

  return query;
}
