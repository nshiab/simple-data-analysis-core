import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function replace(
  simpleTable: SimpleTable,
  columns: "all" | string | string[],
  replacements: { [key: string]: string },
  options: {
    entireString?: boolean;
    regex?: boolean;
  } = {},
) {
  options.entireString = options.entireString ?? false;
  options.regex = options.regex ?? false;
  // This validation doesn't need the database, so it stays at call time.
  if (options.entireString === true && options.regex === true) {
    throw new Error(
      "You can't have entireString to true and regex to true at the same time. Pick one.",
    );
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "replace()",
    parameters: { columns, replacements, options },
    // The schema is only needed to resolve "all" to the column list.
    needsSchema: columns === "all",
    buildSelect: (input, schema) => {
      const columnList = columns === "all"
        ? Object.keys(schema)
        : stringToArray(columns);
      return replaceSelect(
        input,
        columnList,
        Object.keys(replacements),
        Object.values(replacements),
        options,
      );
    },
  });
}

function replaceSelect(
  input: string,
  columns: string[],
  oldTexts: string[],
  newTexts: string[],
  options: { entireString?: boolean; regex?: boolean } = {},
) {
  oldTexts = oldTexts.map((d) => d.replace(/'/g, "''"));
  newTexts = newTexts.map((d) => d.replace(/'/g, "''"));

  // The sequential UPDATEs become nested expressions: each replacement
  // applies to the result of the previous one.
  const replacements = columns.map((column) => {
    let expression = `"${column}"`;
    for (let i = 0; i < oldTexts.length; i++) {
      if (options.entireString) {
        expression = `CASE
                    WHEN ${expression} = '${oldTexts[i]}' THEN '${newTexts[i]}'
                    ELSE ${expression}
                END`;
      } else if (options.regex) {
        expression = `REGEXP_REPLACE(${expression}, '${oldTexts[i]}', '${
          newTexts[i]
        }', 'g')`;
      } else {
        expression = `REPLACE(${expression}, '${oldTexts[i]}', '${
          newTexts[i]
        }')`;
      }
    }
    return `${expression} AS "${column}"`;
  });

  return `SELECT * REPLACE (${replacements.join(", ")}) FROM ${input}`;
}
