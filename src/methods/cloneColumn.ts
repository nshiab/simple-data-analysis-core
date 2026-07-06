import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function cloneColumn(
  simpleTable: SimpleTable,
  originalColumn: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "cloneColumn()",
    parameters: { originalColumn, newColumn },
    needsSchema: true,
    buildSelect: (input, types) => {
      if (!types[originalColumn]) {
        throw new Error(`Can't find type of ${originalColumn}`);
      }
      return `SELECT *, "${originalColumn}" AS "${newColumn}" FROM ${input}`;
    },
  });
}
