import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function inside(
  simpleTable: SimpleTable,
  column: string,
  containerColumn: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "inside()",
    parameters: { column, containerColumn, newColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "inside()");
      return `SELECT *, CAST(ST_Covers(${quoteIdentifier(containerColumn)}, ${
        quoteIdentifier(column)
      }) AS BOOLEAN) AS ${quoteIdentifier(newColumn)} FROM ${input}`;
    },
  });
}
