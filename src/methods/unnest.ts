import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function unnest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "unnest()",
    parameters: { column, separator },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT
  * EXCLUDE "${column}",
  TRIM(UNNEST(SPLIT("${column}", '${separator}'))) AS "${column}"
FROM ${input}`,
  });
}
