import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function removeRows(
  simpleTable: SimpleTable,
  conditions: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeRows()",
    parameters: { conditions },
    needsSchema: false,
    rawSQL: [conditions],
    preservesSchema: true,
    // DELETE removes rows where the conditions are TRUE and keeps rows where
    // they are FALSE or NULL, so the SELECT equivalent is IS NOT TRUE.
    buildSelect: (input) =>
      `SELECT * FROM ${input} WHERE (${conditions}) IS NOT TRUE`,
  });
}
