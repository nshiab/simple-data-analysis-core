import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function quantiles(
  simpleTable: SimpleTable,
  column: string,
  count: number,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "quantiles()",
    parameters: { column, count, newColumn, options },
    needsSchema: true,
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], "quantiles()");

      const categories = options.categories
        ? stringToArray(options.categories)
        : [];

      const partition = categories.length === 0
        ? ""
        : `PARTITION BY ${
          categories.map((d) => `${quoteIdentifier(d)}`).join(",")
        } `;

      return `SELECT *, ntile(${count}) OVER (${partition}ORDER BY ${
        quoteIdentifier(column)
      }) AS ${quoteIdentifier(newColumn)}
    FROM ${input}`;
    },
  });
}
