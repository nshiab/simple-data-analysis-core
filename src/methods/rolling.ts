import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function rolling(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  summary: "min" | "max" | "mean" | "median" | "sum",
  preceding: number,
  following: number,
  options: {
    categories?: string | string[];
    decimals?: number;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "rolling()",
    parameters: { column, newColumn, summary, preceding, following, options },
    needsSchema: false,
    buildSelect: (input) =>
      rollingSelect(
        input,
        column,
        newColumn,
        summary,
        preceding,
        following,
        options,
      ),
  });
}

function rollingSelect(
  input: string,
  column: string,
  newColumn: string,
  summary: "count" | "min" | "max" | "mean" | "median" | "sum",
  preceding: number,
  following: number,
  options: {
    categories?: string | string[];
    decimals?: number;
  } = {},
) {
  const aggregates: { [key: string]: string } = {
    count: "COUNT",
    min: "MIN",
    max: "MAX",
    mean: "AVG",
    median: "MEDIAN",
    sum: "SUM",
  };

  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  const partition = categories.length > 0
    ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
    : "";

  const window = `OVER (${partition}
                ROWS BETWEEN ${preceding} PRECEDING AND ${following} FOLLOWING)`;

  const tempQuery = `${aggregates[summary]}("${column}") ${window}`;

  // Windows touching the edges of the frame (or of their category) have
  // fewer values than requested, so their result is NULL.
  return `SELECT *,
    CASE
        WHEN COUNT("${column}") ${window} != ${
    preceding + following + 1
  } THEN NULL
        ELSE ${
    typeof options.decimals === "number"
      ? `ROUND(${tempQuery}, ${options.decimals})`
      : tempQuery
  }
    END AS "${newColumn}"
        FROM ${input}`;
}
