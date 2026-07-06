import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function left(
  simpleTable: SimpleTable,
  column: string,
  numberOfCharacters: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "left()",
    parameters: { column, numberOfCharacters },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (LEFT("${column}", ${numberOfCharacters}) AS "${column}") FROM ${input}`,
  });
}
