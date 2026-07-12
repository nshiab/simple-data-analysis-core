import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import resolveOutputTable from "../helpers/resolveOutputTable.ts";
import stringToArray from "../helpers/stringToArray.ts";

import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

type Summary =
  | "count"
  | "countUnique"
  | "countNull"
  | "min"
  | "max"
  | "mean"
  | "median"
  | "sum"
  | "skew"
  | "stdDev"
  | "var";

type SummarizeOptions = {
  outputTable?: string | boolean;
  values?: string | string[];
  categories?: string | string[];
  summaries?: Summary | Summary[] | { [key: string]: Summary };
  decimals?: number;
  datesToMs?: boolean;
};

export default function summarize(
  simpleTable: SimpleTable,
  options: SummarizeOptions = {},
): SimpleTable {
  options.outputTable = resolveOutputTable(simpleTable, options.outputTable);

  if (typeof options.outputTable === "string") {
    // The output table instance is created at call time so it can be
    // returned synchronously and chained on right away.
    const outputTable = simpleTable.sdb.newTable(options.outputTable);
    queueOp(outputTable, {
      kind: "barrier",
      method: "summarize()",
      parameters: { options },
      execute: async () => {
        await queryDB(
          simpleTable,
          `CREATE OR REPLACE TABLE "${outputTable.name}" AS ${
            summarizeSelect(
              `"${simpleTable.name}"`,
              await simpleTable.getTypes(),
              options,
            )
          }`,
          mergeOptions(simpleTable, {
            table: outputTable.name,
            method: "summarize()",
            parameters: { options },
          }),
        );
      },
    });
    return outputTable;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "summarize()",
    parameters: { options },
    needsSchema: true,
    buildSelect: (input, types) => summarizeSelect(input, types, options),
  });
  return simpleTable;
}

const allSummaries: Summary[] = [
  "count",
  "countUnique",
  "countNull",
  "min",
  "max",
  "mean",
  "median",
  "sum",
  "skew",
  "stdDev",
  "var",
];

const aggregateFunctions: { [key: string]: string } = {
  min: "MIN",
  max: "MAX",
  mean: "AVG",
  median: "MEDIAN",
  sum: "SUM",
  skew: "SKEWNESS",
  stdDev: "STDDEV",
  var: "VARIANCE",
};

const timeTypes = [
  "DATE",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMP_MS",
  "TIMESTAMP WITH TIME ZONE",
];

function summarizeSelect(
  input: string,
  types: TableSchema,
  options: SummarizeOptions,
): string {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  // Duplicated values would duplicate rows now that the branches are combined
  // with UNION ALL instead of a deduplicating UNION.
  const values = [
    ...new Set(
      (options.values ? stringToArray(options.values) : []).filter(
        (d) => !categories.includes(d),
      ),
    ),
  ];

  let summaries: Summary[];
  let columns: string[] | undefined;
  if (options.summaries === undefined) {
    summaries = values.length === 0 ? ["count"] : allSummaries;
  } else if (typeof options.summaries === "string") {
    summaries = [options.summaries];
  } else if (Array.isArray(options.summaries)) {
    summaries = options.summaries.length === 0
      ? allSummaries
      : options.summaries;
  } else {
    const entries = Object.entries(options.summaries);
    columns = entries.map((d) => d[0]);
    summaries = entries.map((d) => d[1]);
  }

  // The value column is a row key: it distinguishes the rows of different
  // value columns, so it appears only when there is more than one.
  const valueColumn = values.length > 1;

  // With datesToMs, dates are converted to milliseconds inside the aggregate
  // expressions (same conversions as convert()), so the input table is left
  // untouched instead of being rewritten.
  const references: { [column: string]: string } = {};
  const effectiveTypes: TableSchema = {};
  for (const value of values) {
    const type = types[value];
    if (
      options.datesToMs === true &&
      typeof type === "string" &&
      (type.includes("TIME") || type.includes("DATE"))
    ) {
      references[value] = type.includes("TIME")
        ? `(date_part('epoch', "${value}") * 1000)`
        : `(epoch("${value}") * 1000)`;
      effectiveTypes[value] = "BIGINT";
    } else {
      references[value] = `"${value}"`;
      effectiveTypes[value] = type;
    }
  }

  const typesOfValues = values.map((d) => effectiveTypes[d]);
  const doubleAndDate = typesOfValues.includes("DOUBLE") &&
    typesOfValues.filter((d) => timeTypes.includes(d)).length >= 1;
  if (doubleAndDate) {
    throw new Error(
      "You are trying to summarize numbers and timestamps/dates/times. You can specify values in the options (just numbers or just timestamps/dates/times) or convert your timestamps/dates/times to the number of ms since 1970-01-01 00:00:00 by passing the option { datesToMs: true }.",
    );
  }

  const catSelect = categories.map((d) => `"${d}"`).join(", ");
  const groupBy = categories.length > 0 ? `\nGROUP BY ${catSelect}` : "";

  // With no values, the only meaningful summary is the row count, which
  // doesn't need a value column (or any temporary column) at all.
  if (values.length === 0) {
    const summaryColumns = summaries.map((summary, i) => {
      const name = columns ? columns[i] : summary;
      return summary === "count"
        ? `CAST(COUNT(*) AS INTEGER) AS '${name}'`
        : `NULL AS '${name}'`;
    });
    const orderBy = categories.length > 0
      ? `\nORDER BY ${categories.map((d) => `"${d}" ASC`).join(", ")}`
      : "";
    return `SELECT ${
      [
        ...categories.map((d) => `"${d}"`),
        ...summaryColumns,
      ].join(", ")
    }\nFROM ${input}${groupBy}${orderBy}`;
  }

  // One UNION ALL branch per value column. DuckDB runs the branches as
  // concurrent pipelines, which parallelizes the expensive aggregates
  // (medians, distinct counts) better than computing them all in one scan.
  const branches: string[] = [];
  for (const value of values) {
    let hasAggregate = false;
    const projections = summaries.map((summary, j) => {
      const name = columns ? columns[j] : summary;
      const expression = aggregateExpression(
        summary,
        effectiveTypes[value],
        references[value],
        options.decimals,
      );
      if (expression === null) {
        return `NULL AS '${name}'`;
      }
      hasAggregate = true;
      return `${expression} AS '${name}'`;
    });
    const select = `SELECT ${valueColumn ? `'${value}' AS 'value', ` : ""}${
      catSelect === "" ? "" : `${catSelect}, `
    }${projections.join(", ")}`;
    if (categories.length === 0 && !hasAggregate) {
      // Every summary is NULL and there is nothing to group by: the branch
      // is a single constant row, so the input is not even scanned.
      branches.push(select);
    } else {
      branches.push(`${select}\nFROM ${input}${groupBy}`);
    }
  }

  const orderByColumns = valueColumn ? ["value", ...categories] : categories;
  const orderBy = orderByColumns.length > 0
    ? `\nORDER BY ${orderByColumns.map((d) => `"${d}" ASC`).join(", ")}`
    : "";

  return `${branches.join("\nUNION ALL\n")}${orderBy}`;
}

/**
 * Returns the aggregate expression for one summary of one value column, or
 * `null` when the combination of summary and column type is not supported
 * (the output column is NULL for that value column).
 */
function aggregateExpression(
  summary: Summary,
  type: string | undefined,
  reference: string,
  decimals: number | undefined,
): string | null {
  if (typeof type === "string" && type.toLowerCase().includes("geometry")) {
    return null;
  }
  if (summary === "count") {
    return `CAST(COUNT(*) AS INTEGER)`;
  }
  if (summary === "countUnique") {
    return `CAST(COUNT(DISTINCT ${reference}) AS INTEGER)`;
  }
  if (summary === "countNull") {
    return `CAST(COUNT(CASE WHEN ${reference} IS NULL THEN 1 END) AS INTEGER)`;
  }
  if (type === "VARCHAR") {
    return null;
  }
  if (
    typeof type === "string" &&
    timeTypes.includes(type) &&
    ["mean", "sum", "skew", "stdDev", "var"].includes(summary)
  ) {
    return null;
  }
  const aggregate = `${aggregateFunctions[summary]}(${reference})`;
  return typeof decimals === "number" &&
      typeof type === "string" &&
      ![
        "VARCHAR",
        "DATE",
        "TIME",
        "TIMESTAMP",
        "TIMESTAMP WITH TIME ZONE",
      ].includes(type)
    ? `ROUND(${aggregate}, ${decimals})`
    : aggregate;
}
