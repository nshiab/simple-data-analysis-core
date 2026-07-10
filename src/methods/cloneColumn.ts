import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function cloneColumn(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "cloneColumn()",
    parameters: { column, newColumn },
    needsSchema: true,
    buildSelect: (input, types) => {
      if (!types[column]) {
        throw new Error(`Can't find type of ${column}`);
      }
      assertNewColumns(types, [newColumn], "cloneColumn()");
      return `SELECT *, "${column}" AS "${newColumn}" FROM ${input}`;
    },
  });
}
