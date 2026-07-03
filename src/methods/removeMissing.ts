import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";

import type SimpleTable from "../class/SimpleTable.ts";

export default async function removeMissing(
  simpleTable: SimpleTable,
  options: {
    columns?: string | string[];
    missingValues?: (string | number)[];
    invert?: boolean;
  } = {},
) {
  options.missingValues = options.missingValues ?? [
    "undefined",
    "NaN",
    "null",
    "NULL",
    "",
  ];

  const types = await simpleTable.getTypes();
  const allColumns = Object.keys(types);

  options.columns = stringToArray(options.columns ?? []);

  await queryDB(
    simpleTable,
    removeMissingQuery(
      simpleTable.name,
      allColumns,
      types,
      options.columns.length === 0 ? allColumns : options.columns,
      options,
    ),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "removeMissing()",
      parameters: { options },
    }),
  );
}

function removeMissingQuery(
  table: string,
  allColumns: string[],
  types: {
    [key: string]: string;
  },
  columns: string[],
  options: {
    missingValues?: (string | number)[];
    invert?: boolean;
  } = {},
) {
  let query = `CREATE OR REPLACE TABLE "${table}" AS SELECT ${
    allColumns
      .map((d) => `"${d}"`)
      .join(", ")
  } FROM "${table}"
        WHERE`;

  if (options.invert) {
    for (let i = 0; i < columns.length; i++) {
      query += `\n"${columns[i]}" IS NULL OR`;
      if (options.missingValues) {
        for (const otherMissingValue of options.missingValues) {
          if (
            typeof otherMissingValue === "string" &&
            types[columns[i]] === "VARCHAR"
          ) {
            query += `\n"${columns[i]}" = '${otherMissingValue}' OR`;
          } else if (
            typeof otherMissingValue === "number" &&
            ["BIGINT", "DOUBLE"].includes(types[columns[i]])
          ) {
            query += `\n"${columns[i]}" = ${otherMissingValue} OR`;
          }
        }
      }
    }
  } else {
    for (let i = 0; i < columns.length; i++) {
      query += `\n"${columns[i]}" IS NOT NULL AND`;
      if (options.missingValues) {
        for (const otherMissingValue of options.missingValues) {
          if (
            typeof otherMissingValue === "string" &&
            types[columns[i]] === "VARCHAR"
          ) {
            query += `\n"${columns[i]}" != '${otherMissingValue}' AND`;
          } else if (
            typeof otherMissingValue === "number" &&
            ["BIGINT", "DOUBLE"].includes(types[columns[i]])
          ) {
            query += `\n"${columns[i]}" != ${otherMissingValue} AND`;
          }
        }
      }
    }
  }

  return options.invert
    ? query.slice(0, query.length - 3)
    : query.slice(0, query.length - 4);
}
