import quoteIdentifier from "../helpers/quoteIdentifier.ts";
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
  options = structuredClone(options);
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
        ? `PARTITION BY ${
          categories.map((d) => `${quoteIdentifier(d)}`).join(", ")
        }`
        : "";

      const tempQuery = `(${quoteIdentifier(column)}-AVG(${
        quoteIdentifier(column)
      }) OVER(${partition}))
            /
            STDDEV_POP(${quoteIdentifier(column)}) OVER(${partition})`;
      return `SELECT *, (
        ${
        typeof options.decimals === "number"
          ? `ROUND(${tempQuery}, ${options.decimals})`
          : tempQuery
      }
        ) AS ${quoteIdentifier(newColumn)},
    FROM ${input}`;
    },
  });
}
