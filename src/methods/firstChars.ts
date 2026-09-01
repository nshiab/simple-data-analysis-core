import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function firstChars(
  simpleTable: SimpleTable,
  column: string,
  count: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "firstChars()",
    parameters: { column, count },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (LEFT(${quoteIdentifier(column)}, ${count}) AS ${
        quoteIdentifier(column)
      }) FROM ${input}`,
  });
}
