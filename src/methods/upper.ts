import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function upper(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  const cols = stringToArray(columns);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "upper()",
    parameters: { columns },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (${
        cols.map((c) => `UPPER(${quoteIdentifier(c)}) AS ${quoteIdentifier(c)}`)
          .join(", ")
      }) FROM ${input}`,
  });
}
