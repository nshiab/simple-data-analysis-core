import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function lower(
  simpleTable: SimpleTable,
  columns: string | string[],
) {
  const cols = stringToArray(columns);
  simpleTable.pendingOps.push({
    kind: "fusable",
    method: "lower()",
    parameters: { columns },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (${
        cols.map((c) => `LOWER("${c}") AS "${c}"`).join(", ")
      }) FROM ${input}`,
  });
}
