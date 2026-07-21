import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function capitalize(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  const cols = stringToArray(columns);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "capitalize()",
    parameters: { columns },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (${
        cols
          .map((c) =>
            `CONCAT(UPPER(LEFT(${quoteIdentifier(c)}, 1)), LOWER(RIGHT(${
              quoteIdentifier(c)
            }, LENGTH(${quoteIdentifier(c)})-1))) AS ${quoteIdentifier(c)}`
          )
          .join(", ")
      }) FROM ${input}`,
  });
}
