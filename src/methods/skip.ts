import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function skip(
  simpleTable: SimpleTable,
  nbRowsToSkip: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "skip()",
    parameters: { nbRowsToSkip },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * FROM ${input} OFFSET ${nbRowsToSkip} ROWS`,
  });
}
