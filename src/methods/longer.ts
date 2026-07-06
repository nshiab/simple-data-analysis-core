import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function longer(
  simpleTable: SimpleTable,
  columns: string[],
  columnsTo: string,
  valuesTo: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "longer()",
    parameters: { columns, columnsTo, valuesTo },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * FROM (
            FROM ${input} UNPIVOT INCLUDE NULLS (
            "${valuesTo}"
            for "${columnsTo}" in (${columns.map((d) => `"${d}"`).join(", ")})
            )
        )`,
  });
}
