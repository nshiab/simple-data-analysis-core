import stringToArray from "../helpers/stringToArray.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function accumulate(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  await queryDB(
    simpleTable,
    accumulateQuery(simpleTable.name, column, newColumn, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "accumulate()",
      parameters: { column, newColumn, options },
    }),
  );
}

function accumulateQuery(
  table: string,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  const partition = categories.length > 0
    ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")} `
    : "";

  const query =
    `CREATE OR REPLACE TABLE "${table}" AS SELECT *, ROW_NUMBER() OVER() AS "idForAccumulate" FROM "${table}";
    CREATE OR REPLACE TABLE "${table}" AS SELECT *, SUM("${column}") OVER (${partition}ORDER BY "idForAccumulate") AS "${newColumn}"
    FROM "${table}"
    ORDER BY "idForAccumulate";
    ALTER TABLE "${table}" DROP "idForAccumulate";`;

  return query;
}
