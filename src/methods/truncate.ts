import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function truncate(
  simpleTable: SimpleTable,
  column: string,
  length: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "truncate()",
    parameters: { column, length },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (LEFT("${column}", ${length}) AS "${column}") FROM ${input}`,
  });
}
