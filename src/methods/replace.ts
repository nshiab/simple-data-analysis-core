import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function replace(
  simpleTable: SimpleTable,
  columns: "all" | string | string[],
  strings: { [key: string]: string },
  options: {
    entireString?: boolean;
    regex?: boolean;
  } = {},
) {
  options.entireString = options.entireString ?? false;
  options.regex = options.regex ?? false;
  if (options.entireString === true && options.regex === true) {
    throw new Error(
      "You can't have entireString to true and regex to true at the same time. Pick one.",
    );
  }
  const columnList = columns === "all"
    ? await simpleTable.getColumns()
    : stringToArray(columns);
  await queryDB(
    simpleTable,
    replaceQuery(
      simpleTable.name,
      columnList,
      Object.keys(strings),
      Object.values(strings),
      options,
    ),
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "replace()",
      parameters: { columns, strings, options },
    }),
  );
}

function replaceQuery(
  table: string,
  columns: string[],
  oldTexts: string[],
  newTexts: string[],
  options: { entireString?: boolean; regex?: boolean } = {},
) {
  let query = "";

  oldTexts = oldTexts.map((d) => d.replace(/'/g, "''"));
  newTexts = newTexts.map((d) => d.replace(/'/g, "''"));

  for (const column of columns) {
    for (let i = 0; i < oldTexts.length; i++) {
      if (options.entireString) {
        query += `UPDATE "${table}" SET "${column}" = 
                CASE
                    WHEN "${column}" = '${oldTexts[i]}' THEN '${newTexts[i]}'
                    ELSE "${column}"
                END;\n`;
      } else if (options.regex) {
        query +=
          `UPDATE "${table}" SET "${column}" = REGEXP_REPLACE("${column}", '${
            oldTexts[i]
          }', '${newTexts[i]}', 'g');\n`;
      } else {
        query += `UPDATE "${table}" SET "${column}" = REPLACE("${column}", '${
          oldTexts[i]
        }', '${newTexts[i]}');\n`;
      }
    }
  }

  return query;
}
