import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function selectColumns(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  simpleTable.pendingOps.push({
    kind: "fusable",
    method: "selectColumns()",
    parameters: { columns },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT ${
        stringToArray(columns)
          .map((d) => `"${d}"`)
          .join(", ")
      } FROM ${input}`,
  });
}
