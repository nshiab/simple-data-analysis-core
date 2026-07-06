import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function renameColumns(
  simpleTable: SimpleTable,
  names: { [key: string]: string },
) {
  const oldNames = Object.keys(names);
  const newNames = Object.values(names);

  queueOp(simpleTable, {
    kind: "fusable",
    method: "renameColumns()",
    parameters: { names },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * RENAME (${
        oldNames
          .map((d, i) => `"${d}" AS "${newNames[i]}"`)
          .join(", ")
      }) FROM ${input}`,
  });
}
