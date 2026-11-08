/** Validates optional decimal places before embedding them in SQL. */
export function validateDecimals(decimals: number | undefined): void {
  if (
    decimals !== undefined &&
    (!Number.isInteger(decimals) || decimals < 0 || decimals > 2147483647)
  ) {
    throw new Error("options.decimals must be a finite non-negative integer at most 2147483647.");
  }
}

/** Rounds a final numeric expression, leaving integers and nonnumeric types unchanged. */
export default function roundExpression(
  expression: string,
  decimals: number | undefined,
  type?: string,
): string {
  validateDecimals(decimals);
  if (
    decimals === undefined ||
    (type !== undefined && !/^(FLOAT|REAL|DOUBLE|DECIMAL\(\d+,\d+\))$/.test(type))
  ) {
    return expression;
  }
  return `ROUND(${expression}, ${decimals})`;
}
