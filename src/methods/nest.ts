import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function nest(
  simpleTable: SimpleTable,
  column: string,
  separator: string,
  categories: string | string[],
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "nest()",
    parameters: { column, separator, categories },
    needsSchema: false,
    buildSelect: (input) => {
      const cats = stringToArray(categories);
      const groupBy = cats.map((d) => `"${d}"`).join(", ");
      const selectColumns = `${groupBy}, `;
      const orderBy = `\nORDER BY ${cats.map((d) => `"${d}" ASC`).join(", ")}`;

      return `SELECT
  ${selectColumns}STRING_AGG("${column}", '${separator}') AS "${column}"
FROM ${input}
GROUP BY ${groupBy}${orderBy}`;
    },
  });
}
