import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function lastChars(
  simpleTable: SimpleTable,
  column: string,
  nbCharacters: number,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "lastChars()",
    parameters: { column, nbCharacters },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (RIGHT("${column}", ${nbCharacters}) AS "${column}") FROM ${input}`,
  });
}
