import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function proportionsVertical(
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
    method: "proportionsVertical()",
    parameters: { column, newColumn, options },
    needsSchema: false,
    buildSelect: (input) => {
      const categories = options.categories
        ? stringToArray(options.categories)
        : [];

      const partition = categories.length === 0
        ? ""
        : `PARTITION BY ${categories.map((d) => `"${d}"`).join(",")}`;

      return typeof options.decimals === "number"
        ? `SELECT *, ROUND("${column}" / sum("${column}") OVER(${partition}), ${options.decimals}) AS "${newColumn}" FROM ${input}`
        : `SELECT *, "${column}" / sum("${column}") OVER(${partition}) AS "${newColumn}" FROM ${input}`;
    },
  });
}
