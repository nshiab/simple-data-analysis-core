import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
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
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "normalize()",
    parameters: { column, newColumn, options },
    needsSchema: true,
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], "normalize()");

      const categories = options.categories
        ? stringToArray(options.categories)
        : [];
      const partition = categories.length > 0
        ? `PARTITION BY ${
          categories.map((d) => `${quoteIdentifier(d)}`).join(", ")
        }`
        : "";

      const tempQuery = `(${quoteIdentifier(column)} - MIN(${
        quoteIdentifier(column)
      }) OVER(${partition}))
    /
    (MAX(${quoteIdentifier(column)}) OVER(${partition}) - MIN(${
        quoteIdentifier(column)
      }) OVER(${partition}))`;

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
