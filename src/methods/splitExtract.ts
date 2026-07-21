import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
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
    values: [separator],
    needsSchema: true,
    buildSelect: (input, types) => {
      // Writing back to the split column itself is allowed (in-place); any
      // other existing column is a duplicate, like v1's ALTER TABLE ADD.
      assertNewColumns(types, [newColumn], "splitExtract()", [column]);
      const expression = `SPLIT_PART(${quoteIdentifier(column)}, ?, ${
        index + 1
      })`;
      return column === newColumn
        ? `SELECT * REPLACE (${expression} AS ${
          quoteIdentifier(newColumn)
        }) FROM ${input}`
        : `SELECT *, ${expression} AS ${
          quoteIdentifier(newColumn)
        } FROM ${input}`;
    },
  });
}
