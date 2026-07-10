import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function ranks(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    order?: "asc" | "desc";
    categories?: string | string[];
    dense?: boolean;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "ranks()",
    parameters: { column, newColumn, options },
    needsSchema: false,
    buildSelect: (input) => {
      const categories = options.categories
        ? stringToArray(options.categories)
        : [];

      const partition = categories.length === 0
        ? ""
        : `PARTITION BY ${categories.map((d) => `"${d}"`).join(",")} `;

      return `SELECT *, ${
        options.dense ? "dense_rank()" : "rank()"
      } OVER (${partition}ORDER BY "${column}" ${
        typeof options.order === "string" ? options.order.toUpperCase() : ""
      }) AS "${newColumn}"
    FROM ${input}`;
    },
  });
}
