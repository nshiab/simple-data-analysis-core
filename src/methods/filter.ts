import type SimpleTable from "../class/SimpleTable.ts";

export default function filter(
  simpleTable: SimpleTable,
  conditions: string,
) {
  simpleTable.pendingOps.push({
    kind: "fusable",
    method: "filter()",
    parameters: { conditions },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT *
        FROM ${input}
        WHERE ${conditions}`,
  });
}
