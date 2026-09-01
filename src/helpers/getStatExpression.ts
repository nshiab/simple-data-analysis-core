export type Stat =
  | "count"
  | "countDistinct"
  | "countNull"
  | "min"
  | "max"
  | "mean"
  | "median"
  | "sum"
  | "skew"
  | "stdDev"
  | "variance";

export const allStats: readonly Stat[] = [
  "count",
  "countDistinct",
  "countNull",
  "min",
  "max",
  "mean",
  "median",
  "sum",
  "skew",
  "stdDev",
  "variance",
];

const aggregateFunctions: Partial<Record<Stat, string>> = {
  min: "MIN",
  max: "MAX",
  mean: "AVG",
  median: "MEDIAN",
  sum: "SUM",
  skew: "SKEWNESS",
  stdDev: "STDDEV",
  variance: "VARIANCE",
};

const temporalStatTypes: readonly string[] = [
  "DATE",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMP_MS",
  "TIMESTAMP WITH TIME ZONE",
];

/** Returns whether a DuckDB type is temporal for statistic compatibility. */
export function isTemporalStatType(
  type: string | undefined,
): boolean {
  return typeof type === "string" && temporalStatTypes.includes(type);
}

/**
 * Returns the aggregate expression for one statistic of one column, or `null`
 * when the statistic is not supported for the column type.
 */
export default function getStatExpression(
  stat: Stat,
  type: string | undefined,
  reference: string,
  decimals: number | undefined,
): string | null {
  if (typeof type === "string" && type.toLowerCase().includes("geometry")) {
    return null;
  }
  if (stat === "count") {
    return `CAST(COUNT(*) AS INTEGER)`;
  }
  if (stat === "countDistinct") {
    return `CAST(COUNT(DISTINCT ${reference}) AS INTEGER)`;
  }
  if (stat === "countNull") {
    return `CAST(COUNT(CASE WHEN ${reference} IS NULL THEN 1 END) AS INTEGER)`;
  }
  if (type === "VARCHAR") {
    return null;
  }
  if (
    isTemporalStatType(type) &&
    ["mean", "sum", "skew", "stdDev", "variance"].includes(stat)
  ) {
    return null;
  }
  const aggregateFunction = aggregateFunctions[stat];
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
