import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function splitExtract(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  index: number,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "splitExtract()",
    parameters: { column, separator, index, newColumn },
    needsSchema: false,
    buildSelect: (input) => {
      const expression = `SPLIT_PART("${column}", '${separator}', ${
        index + 1
      })`;
      return column === newColumn
        ? `SELECT * REPLACE (${expression} AS "${newColumn}") FROM ${input}`
        : `SELECT *, ${expression} AS "${newColumn}" FROM ${input}`;
    },
  });
}
