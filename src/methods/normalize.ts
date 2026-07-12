import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function normalize(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
    decimals?: number;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "normalize()",
    parameters: { column, newColumn, options },
    needsSchema: false,
    buildSelect: (input) => {
      const categories = options.categories
        ? stringToArray(options.categories)
        : [];
      const partition = categories.length > 0
        ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
        : "";

      const tempQuery = `("${column}" - MIN("${column}") OVER(${partition}))
    /
    (MAX("${column}") OVER(${partition}) - MIN("${column}") OVER(${partition}))`;

      return `SELECT *, (
        ${
        typeof options.decimals === "number"
          ? `ROUND(${tempQuery}, ${options.decimals})`
          : tempQuery
      }
        ) AS ${newColumn},
    FROM ${input}`;
    },
  });
}
