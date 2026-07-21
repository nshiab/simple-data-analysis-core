import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function nest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  categories: string | string[],
) {
  categories = Array.isArray(categories) ? [...categories] : categories;
  queueOp(simpleTable, {
    kind: "fusable",
    method: "nest()",
    parameters: { column, separator, categories },
    values: [separator],
    needsSchema: false,
    buildSelect: (input) => {
      const cats = stringToArray(categories);
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
