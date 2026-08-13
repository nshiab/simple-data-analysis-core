import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function nest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  by: string | string[],
) {
  by = Array.isArray(by) ? [...by] : by;
  queueOp(simpleTable, {
    kind: "fusable",
    method: "nest()",
    parameters: { column, separator, by },
    values: [separator],
    needsSchema: false,
    buildSelect: (input) => {
      const cats = stringToArray(by);
      const groupBy = cats.map((d) => `${quoteIdentifier(d)}`).join(", ");
      const selectColumns = `${groupBy}, `;
      const orderBy = `\nORDER BY ${
        cats.map((d) => `${quoteIdentifier(d)} ASC`).join(", ")
      }`;

      return `SELECT
  ${selectColumns}STRING_AGG(${quoteIdentifier(column)}, ?) AS ${
        quoteIdentifier(column)
      }
FROM ${input}
GROUP BY ${groupBy}${orderBy}`;
    },
  });
}
