import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function firstChars(
  simpleTable: SimpleTable,
  column: string,
  nbCharacters: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "firstChars()",
    parameters: { column, nbCharacters },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (LEFT(${quoteIdentifier(column)}, ${nbCharacters}) AS ${
        quoteIdentifier(column)
      }) FROM ${input}`,
  });
}
