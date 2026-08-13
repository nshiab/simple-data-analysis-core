export type Summary =
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

export const allSummaries: readonly Summary[] = [
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

const aggregateFunctions: Partial<Record<Summary, string>> = {
  min: "MIN",
  max: "MAX",
  mean: "AVG",
  median: "MEDIAN",
  sum: "SUM",
  skew: "SKEWNESS",
  stdDev: "STDDEV",
  var: "VARIANCE",
};

const temporalSummaryTypes: readonly string[] = [
  "DATE",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMP_MS",
  "TIMESTAMP WITH TIME ZONE",
];

/** Returns whether a DuckDB type is temporal for summary compatibility. */
export function isTemporalSummaryType(
  type: string | undefined,
): boolean {
  return typeof type === "string" && temporalSummaryTypes.includes(type);
}

/**
 * Returns the aggregate expression for one summary of one column, or `null`
 * when the summary is not supported for the column type.
 */
export default function getSummaryExpression(
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
    isTemporalSummaryType(type) &&
    ["mean", "sum", "skew", "stdDev", "var"].includes(summary)
  ) {
    return null;
  }
  const aggregateFunction = aggregateFunctions[summary];
  if (aggregateFunction === undefined) {
    return null;
  }
  const aggregate = `${aggregateFunction}(${reference})`;
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
