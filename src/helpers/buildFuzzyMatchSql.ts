export type FuzzyMethod =
  | "ratio"
  | "partial_ratio"
  | "token_sort_ratio"
  | "token_set_ratio";

export default function buildFuzzyMatchSql(
  leftExpression: string,
  rightExpression: string,
  method: FuzzyMethod,
  threshold: number,
  options: {
    decimals?: number;
    prefilterPrefixLength?: number;
  } = {},
): { scoreExpression: string; condition: string } {
  const fuzzyExpression =
    `rapidfuzz_${method}(${leftExpression}, ${rightExpression})`;
  const scoreExpression = options.decimals === undefined
    ? fuzzyExpression
    : `ROUND(${fuzzyExpression}, ${options.decimals})`;

  let condition = `${scoreExpression} >= ${threshold}`;

  if (method === "ratio") {
    const maxDiffMultiplier = (200 - 2 * threshold) / (200 - threshold);
    condition +=
      ` AND ABS(LENGTH(${leftExpression}) - LENGTH(${rightExpression})) <= ${maxDiffMultiplier} * GREATEST(LENGTH(${leftExpression}), LENGTH(${rightExpression}))`;
  }
  if (options.prefilterPrefixLength !== undefined) {
    condition +=
      ` AND SUBSTR(${leftExpression}, 1, ${options.prefilterPrefixLength}) = SUBSTR(${rightExpression}, 1, ${options.prefilterPrefixLength})`;
  }

  return { scoreExpression, condition };
}
