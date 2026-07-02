import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function trim(
  simpleTable: SimpleTable,
  columns: string | string[],
  options: {
    character?: string;
    method?: "leftTrim" | "rightTrim" | "trim";
  } = {},
) {
  options.method = options.method ?? "trim";
  await queryDB(
    simpleTable,
    trimQuery(simpleTable.name, stringToArray(columns), options),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "trim()",
      parameters: { columns, options },
    }),
  );
}

function trimQuery(
  table: string,
  columns: string[],
  options: { character?: string; method?: "leftTrim" | "rightTrim" | "trim" },
) {
  let query = ``;

  const method = options.method ?? "trim";

  const specialCharacter = typeof options.character === "string"
    ? `, '${options.character}'`
    : "";

  if (method === "trim") {
    for (const column of columns) {
      query +=
        `\nUPDATE "${table}" SET "${column}" = TRIM("${column}"${specialCharacter});`;
    }
  } else if (method === "leftTrim") {
    for (const column of columns) {
      query +=
        `\nUPDATE "${table}" SET "${column}" = LTRIM("${column}"${specialCharacter});`;
    }
  } else if (method === "rightTrim") {
    for (const column of columns) {
      query +=
        `\nUPDATE "${table}" SET "${column}" = RTRIM("${column}"${specialCharacter});`;
    }
  } else {
    throw new Error(`Unknown method ${options.method}`);
  }

  return query;
}
