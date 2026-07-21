import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function rowToText(
  simpleTable: SimpleTable,
  columns: string[],
  newColumn: string,
) {
  columns = [...columns];
  queueOp(simpleTable, {
    kind: "fusable",
    method: "rowToText()",
    parameters: { columns, newColumn },
    needsSchema: true,
    values: columns.flatMap((col, i) => [
      `${i === 0 ? "" : "\n\n"}${col}:\n`,
      "Unknown",
    ]),
    buildSelect: (input, allTypes) => {
      assertNewColumns(allTypes, [newColumn], "rowToText()");
      for (const col of columns) {
        if (allTypes[col] !== "VARCHAR") {
          throw new Error(
            `The column ${col} is of type ${
              allTypes[col]
            }. The rowToText() method only works with string columns. Please convert the column to string first with the .convert() method.`,
          );
        }
      }

      const parts = columns.map((col) =>
        `? || COALESCE(${quoteIdentifier(col)}, ?)`
      );
      const concatenatedExpression = parts.join(" || ");

      return `SELECT *, CAST(${concatenatedExpression} AS VARCHAR) AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}
