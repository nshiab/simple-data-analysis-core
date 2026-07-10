import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function longer(
  simpleTable: SimpleTable,
  columns: string[],
  namesTo: string,
  valuesTo: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "longer()",
    parameters: { columns, namesTo, valuesTo },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * FROM (
            FROM ${input} UNPIVOT INCLUDE NULLS (
            "${valuesTo}"
            for "${namesTo}" in (${columns.map((d) => `"${d}"`).join(", ")})
            )
        )`,
  });
}
