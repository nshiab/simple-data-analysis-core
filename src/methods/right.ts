import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function right(
  simpleTable: SimpleTable,
  column: string,
  numberOfCharacters: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "right()",
    parameters: { column, numberOfCharacters },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (RIGHT("${column}", ${numberOfCharacters}) AS "${column}") FROM ${input}`,
  });
}
