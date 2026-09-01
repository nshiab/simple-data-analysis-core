import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function unnest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "unnest()",
    parameters: { column, separator },
    values: [separator],
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT
  * EXCLUDE ${quoteIdentifier(column)},
  TRIM(UNNEST(SPLIT(${quoteIdentifier(column)}, ?))) AS ${
        quoteIdentifier(column)
      }
FROM ${input}`,
  });
}
