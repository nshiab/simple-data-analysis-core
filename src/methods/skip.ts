import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function skip(
  simpleTable: SimpleTable,
  count: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "skip()",
    parameters: { count },
    needsSchema: false,
    preservesSchema: true,
    buildSelect: (input) => `SELECT * FROM ${input} OFFSET ${count} ROWS`,
  });
}
