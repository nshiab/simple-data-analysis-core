import quoteIdentifier from "../helpers/quoteIdentifier.ts";
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
  columns = Array.isArray(columns) ? [...columns] : columns;
  replacements = { ...replacements };
  options = { ...options };
  options.entireString = options.entireString ?? false;
  options.regex = options.regex ?? false;
  const entries = Object.entries(replacements);
  const replacementEntries = options.entireString
    ? entries.map(([oldText]) => {
      let newText = oldText;
      for (const [candidate, replacement] of entries) {
        if (newText === candidate) {
          newText = replacement;
        }
      }
      return [oldText, newText] as const;
    })
    : entries;
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
    values: (schema) => {
      const columnList = columns === "all"
        ? Object.keys(schema)
        : stringToArray(columns);
      return columnList.flatMap(() =>
        replacementEntries.flatMap(([oldText, newText]) => [
          oldText,
          newText,
        ])
      );
    },
    buildSelect: (input, schema) => {
      const columnList = columns === "all"
        ? Object.keys(schema)
        : stringToArray(columns);
      return replaceSelect(
        input,
        columnList,
        replacementEntries.length,
        options,
      );
    },
  });
}

function replaceSelect(
  input: string,
  columns: string[],
  replacementCount: number,
  options: { entireString?: boolean; regex?: boolean } = {},
) {
  // The sequential UPDATEs become nested expressions: each replacement
  // applies to the result of the previous one.
  const replacements = columns.map((column) => {
    let expression = `${quoteIdentifier(column)}`;
    if (options.entireString) {
      const branches = Array.from(
        { length: replacementCount },
        () => "WHEN ? THEN ?",
      ).join(" ");
      return `CASE ${expression} ${branches} ELSE ${expression} END AS ${
        quoteIdentifier(column)
      }`;
    }
    for (let i = 0; i < replacementCount; i++) {
      if (options.regex) {
        expression = `REGEXP_REPLACE(${expression}, ?, ?, 'g')`;
      } else {
        expression = `REPLACE(${expression}, ?, ?)`;
      }
    }
    return `${expression} AS ${quoteIdentifier(column)}`;
  });

  return `SELECT * REPLACE (${replacements.join(", ")}) FROM ${input}`;
}
