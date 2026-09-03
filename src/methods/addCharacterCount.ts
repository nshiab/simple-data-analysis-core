import type SimpleTable from "../class/SimpleTable.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default function addCharacterCount(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "addCharacterCount()",
    parameters: { column, newColumn },
    needsSchema: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "addCharacterCount()");
      return `SELECT *, CAST(LENGTH(${quoteIdentifier(column)}) AS BIGINT) AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}
