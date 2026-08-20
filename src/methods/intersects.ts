import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function intersects(
  simpleTable: SimpleTable,
  column1: string,
  column2: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "intersects()",
    parameters: { column1, column2, newColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "intersects()");
      return `SELECT *, CAST(ST_Intersects(${quoteIdentifier(column1)}, ${
        quoteIdentifier(column2)
      }) AS BOOLEAN) AS ${quoteIdentifier(newColumn)} FROM ${input}`;
    },
  });
}
