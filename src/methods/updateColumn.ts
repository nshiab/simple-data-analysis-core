import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function updateColumn(
  simpleTable: SimpleTable,
  column: string,
  definition: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "updateColumn()",
    parameters: { column, definition },
    // The schema is needed to keep the column's type: UPDATE casts the
    // definition to the column's type on assignment.
    needsSchema: true,
    buildSelect: (input, types) =>
      `SELECT * REPLACE (CAST((${definition}) AS ${
        types[column]
      }) AS "${column}") FROM ${input}`,
  });
}
