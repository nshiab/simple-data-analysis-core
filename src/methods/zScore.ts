import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function zScore(
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
    method: "zScore()",
    parameters: { column, newColumn, options },
    needsSchema: true,
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], "zScore()");

      const categories = options.categories
        ? stringToArray(options.categories)
        : [];
      const partition = categories.length > 0
        ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
        : "";

      const tempQuery = `("${column}"-AVG("${column}") OVER(${partition}))
            /
            STDDEV_POP("${column}") OVER(${partition})`;
      return `SELECT *, (
        ${
        typeof options.decimals === "number"
          ? `ROUND(${tempQuery}, ${options.decimals})`
          : tempQuery
      }
        ) AS "${newColumn}",
    FROM ${input}`;
    },
  });
}
