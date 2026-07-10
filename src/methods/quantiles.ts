import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function quantiles(
  simpleTable: SimpleTable,
  column: string,
  nbQuantiles: number,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "quantiles()",
    parameters: { column, nbQuantiles, newColumn, options },
    needsSchema: false,
    buildSelect: (input) => {
      const categories = options.categories
        ? stringToArray(options.categories)
        : [];

      const partition = categories.length === 0
        ? ""
        : `PARTITION BY ${categories.map((d) => `"${d}"`).join(",")} `;

      return `SELECT *, ntile(${nbQuantiles}) OVER (${partition}ORDER BY "${column}") AS "${newColumn}"
    FROM ${input}`;
    },
  });
}
