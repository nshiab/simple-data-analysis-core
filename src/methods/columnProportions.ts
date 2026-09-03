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
    base?: number;
    decimals?: number;
  } = {},
) {
  if (
    options.base !== undefined &&
    (!Number.isFinite(options.base) || options.base <= 0)
  ) {
    throw new Error(
      "columnProportions() options.base must be a finite number greater than 0.",
    );
  }
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
      const proportion = `${quoteIdentifier(column)} / sum(${
        quoteIdentifier(column)
      }) OVER(${partition}) * ${options.base ?? 1}`;

      return typeof options.decimals === "number"
        ? `SELECT *, ROUND(${proportion}, ${options.decimals}) AS ${
          quoteIdentifier(newColumn)
        } FROM ${input}`
        : `SELECT *, ${proportion} AS ${
          quoteIdentifier(newColumn)
        } FROM ${input}`;
    },
  });
}
