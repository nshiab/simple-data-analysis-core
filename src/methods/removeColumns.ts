import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function removeColumns(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  const cols = stringToArray(columns);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeColumns()",
    parameters: { columns },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * EXCLUDE (${
        cols.map((d) => `"${d}"`).join(", ")
      }) FROM ${input}`,
  });
}
