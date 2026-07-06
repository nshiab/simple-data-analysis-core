import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function intersect(
  simpleTable: SimpleTable,
  column1: string,
  column2: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "intersect()",
    parameters: { column1, column2, newColumn },
    needsSchema: false,
    needsSpatial: true,
    buildSelect: (input) =>
      `SELECT *, CAST(ST_Intersects("${column1}", "${column2}") AS BOOLEAN) AS "${newColumn}" FROM ${input}`,
  });
}
