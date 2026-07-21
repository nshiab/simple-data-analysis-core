import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
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
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "ranks()",
    parameters: { column, newColumn, options },
    needsSchema: true,
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], "ranks()");

      const categories = options.categories
        ? stringToArray(options.categories)
        : [];

      const partition = categories.length === 0
        ? ""
        : `PARTITION BY ${
          categories.map((d) => `${quoteIdentifier(d)}`).join(",")
        } `;

      return `SELECT *, ${
        options.dense ? "dense_rank()" : "rank()"
      } OVER (${partition}ORDER BY ${quoteIdentifier(column)} ${
        typeof options.order === "string" ? options.order.toUpperCase() : ""
      }) AS ${quoteIdentifier(newColumn)}
    FROM ${input}`;
    },
  });
}
