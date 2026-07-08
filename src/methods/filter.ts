import type SimpleTable from "../class/SimpleTable.ts";
import queueOp from "../helpers/queueOp.ts";

export default function filter(
  simpleTable: SimpleTable,
  conditions: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "filter()",
    parameters: { conditions },
    needsSchema: false,
    rawSQL: [conditions],
    preservesSchema: true,
    buildSelect: (input) =>
      `SELECT *
        FROM ${input}
        WHERE ${conditions}`,
  });
}
