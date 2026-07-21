import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function repeatRows(
  simpleTable: SimpleTable,
  column: string,
  options: { index?: string } = {},
) {
  options = { ...options };
  queueOp(simpleTable, {
    kind: "fusable",
    method: "repeatRows()",
    parameters: { column, options },
    needsSchema: options.index !== undefined,
    buildSelect: (input, schema) => {
      if (options.index) {
        assertNewColumns(schema, [options.index], "repeatRows()");
        return `SELECT *, UNNEST(range(CAST(${
          quoteIdentifier(column)
        } AS BIGINT))) AS ${quoteIdentifier(options.index)} FROM ${input}`;
      }
      return `SELECT * EXCLUDE (_index) FROM (SELECT *, UNNEST(range(CAST(${
        quoteIdentifier(column)
      } AS BIGINT))) AS _index FROM ${input})`;
    },
  });
}
