import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function round(
  simpleTable: SimpleTable,
  columns: string | string[],
  options:
    | number
    | {
      decimals?: number;
      method?: "round" | "ceiling" | "floor";
    } = {},
) {
  const optionsNormalized = typeof options === "number"
    ? { decimals: options }
    : options;

  await queryDB(
    simpleTable,
    roundQuery(simpleTable.name, stringToArray(columns), optionsNormalized),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "round()",
      parameters: { columns, options },
    }),
  );
}

function roundQuery(
  table: string,
  columns: string[],
  options: { method?: "round" | "ceiling" | "floor"; decimals?: number },
) {
  let query = `UPDATE "${table}" SET`;
  const method = options.method?.toUpperCase() ?? "ROUND";
  const decimals = options.decimals ?? 0;

  if (method === "ROUND") {
    for (const column of columns) {
      query += `\n"${column}" = ${method}("${column}", ${decimals}),`;
    }
  } else {
    for (const column of columns) {
      query += `\n"${column}" = ${method}("${column}"),`;
    }
  }

  return query.slice(0, query.length - 1);
}
