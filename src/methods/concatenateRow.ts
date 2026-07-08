import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function concatenateRow(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "concatenateRow()",
    parameters: { columns, newColumn },
    needsSchema: true,
    buildSelect: (input, allTypes) => {
      assertNewColumns(allTypes, [newColumn], "concatenateRow()");
      for (const col of columns) {
        if (allTypes[col] !== "VARCHAR") {
          throw new Error(
            `The column ${col} is of type ${
              allTypes[col]
            }. The concatenateRow() method only works with string columns. Please convert the column to string first with the .convert() method.`,
          );
        }
      }

      const parts = columns.map(
        (col, i) =>
          i === 0
            ? `'${col}:\n' || COALESCE("${col}", 'Unknown')`
            : `'\n\n${col}:\n' || COALESCE("${col}", 'Unknown')`,
      );
      const concatenatedExpression = parts.join(" || ");

      return `SELECT *, CAST(${concatenatedExpression} AS VARCHAR) AS "${newColumn}" FROM ${input}`;
    },
  });
}
