import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function columnProportions(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    by?: string | string[];
    decimals?: number;
  } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "columnProportions()",
    parameters: { column, newColumn, options },
    needsSchema: true,
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], "columnProportions()");

      const by = options.by ? stringToArray(options.by) : [];

      const partition = by.length === 0
        ? ""
        : `PARTITION BY ${by.map((d) => `${quoteIdentifier(d)}`).join(",")}`;

      return typeof options.decimals === "number"
        ? `SELECT *, ROUND(${quoteIdentifier(column)} / sum(${
          quoteIdentifier(column)
        }) OVER(${partition}), ${options.decimals}) AS ${
          quoteIdentifier(newColumn)
        } FROM ${input}`
        : `SELECT *, ${quoteIdentifier(column)} / sum(${
          quoteIdentifier(column)
        }) OVER(${partition}) AS ${quoteIdentifier(newColumn)} FROM ${input}`;
    },
  });
}
