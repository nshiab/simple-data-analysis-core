import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function rolling(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  stat: "min" | "max" | "mean" | "median" | "sum",
  preceding: number,
  following: number,
  options: {
    by?: string | string[];
    decimals?: number;
  } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "rolling()",
    parameters: { column, newColumn, stat, preceding, following, options },
    needsSchema: true,
    buildSelect: (input, schema) =>
      rollingSelect(
        input,
        schema,
        column,
        newColumn,
        stat,
        preceding,
        following,
        options,
      ),
  });
}

function rollingSelect(
  input: string,
  schema: TableSchema,
  column: string,
  newColumn: string,
  stat: "count" | "min" | "max" | "mean" | "median" | "sum",
  preceding: number,
  following: number,
  options: {
    by?: string | string[];
    decimals?: number;
  } = {},
) {
  assertNewColumns(schema, [newColumn], "rolling()");

  const aggregates: { [key: string]: string } = {
    count: "COUNT",
    min: "MIN",
    max: "MAX",
    mean: "AVG",
    median: "MEDIAN",
    sum: "SUM",
  };

  const by = options.by ? stringToArray(options.by) : [];
  const partition = by.length > 0
    ? `PARTITION BY ${by.map((d) => `${quoteIdentifier(d)}`).join(", ")}`
    : "";

  const window = `OVER (${partition}
                ROWS BETWEEN ${preceding} PRECEDING AND ${following} FOLLOWING)`;

  const tempQuery = `${aggregates[stat]}(${quoteIdentifier(column)}) ${window}`;

  // Windows touching the edges of the frame (or of their category) have
  // fewer values than requested, so their result is NULL.
  return `SELECT *,
    CASE
        WHEN COUNT(${quoteIdentifier(column)}) ${window} != ${
    preceding + following + 1
  } THEN NULL
        ELSE ${
    typeof options.decimals === "number"
      ? `ROUND(${tempQuery}, ${options.decimals})`
      : tempQuery
  }
    END AS ${quoteIdentifier(newColumn)}
        FROM ${input}`;
}
