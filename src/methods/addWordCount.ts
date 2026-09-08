import type SimpleTable from "../class/SimpleTable.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

export default function addWordCount(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "addWordCount()",
    parameters: { column, newColumn },
    needsSchema: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "addWordCount()");
      return `SELECT *, ARRAY_LENGTH(REGEXP_EXTRACT_ALL(${
        quoteIdentifier(column)
      }, '[^[:space:]]+')) AS ${quoteIdentifier(newColumn)} FROM ${input}`;
    },
  });
}
