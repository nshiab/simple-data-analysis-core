import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function concatenate(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
  options: {
    separator?: string;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "concatenate()",
    parameters: { columns, newColumn, options },
    needsSchema: false,
    buildSelect: (input) => {
      const expression = typeof options.separator === "string"
        ? `CONCAT_WS('${options.separator}', ${
          columns
            .map((d) => `"${d}"`)
            .join(", ")
        })`
        : `CONCAT(${columns.map((d) => `"${d}"`).join(", ")})`;
      return `SELECT *, CAST(${expression} AS VARCHAR) AS "${newColumn}" FROM ${input}`;
    },
  });
}
