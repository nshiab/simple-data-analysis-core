import findGeoColumn from "../helpers/findGeoColumn.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function aggregateGeo(
  simpleTable: SimpleTable,
  method: "union" | "intersection",
  options: {
    column?: string;
    categories?: string | string[];
    outputTable?: string | boolean;
  } = {},
) {
  const column = typeof options.column === "string"
    ? options.column
    : await findGeoColumn(simpleTable);

  if (options.outputTable === true) {
    options.outputTable = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
  }
  await queryDB(
    simpleTable,
    aggregateGeoQuery(simpleTable.name, column, method, options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "aggregateGeo()",
      parameters: { column, method, options },
    }),
  );
  if (typeof options.outputTable === "string") {
    return simpleTable.sdb.newTable(options.outputTable);
  } else {
    return simpleTable;
  }
}

function aggregateGeoQuery(
  table: string,
  column: string,
  method: "union" | "intersection",
  options: {
    categories?: string | string[];
    outputTable?: string | boolean;
  } = {},
) {
  const categoriesOptions = options.categories ?? [];
  const categories = stringToArray(categoriesOptions);

  let query = `CREATE OR REPLACE TABLE "${options.outputTable ?? table}" AS
    SELECT${
    categories.length > 0
      ? ` ${categories.map((d) => `"${d}"`).join(", ")},`
      : ""
  }`;

  if (method === "union") {
    query +=
      ` CASE WHEN ST_IsEmpty(ST_Union_Agg("${column}")) THEN NULL ELSE ST_Union_Agg("${column}") END AS "${column}"`;
  } else if (method === "intersection") {
    query += ` ST_Intersection_Agg("${column}") AS "${column}"`;
  } else {
    throw new Error(`Unkown method ${method}`);
  }

  query += `\nFROM "${table}"`;

  if (categories.length > 0) {
    query += `\nGROUP BY ${categories.map((d) => `"${d}"`).join(", ")}`;
    query += `\nORDER BY ${categories.map((d) => `"${d}" ASC`).join(", ")}`;
  }

  return query;
}
