import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function lastChars(
  simpleTable: SimpleTable,
  column: string,
  count: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "lastChars()",
    parameters: { column, count },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (RIGHT(${quoteIdentifier(column)}, ${count}) AS ${
        quoteIdentifier(column)
      }) FROM ${input}`,
  });
}
