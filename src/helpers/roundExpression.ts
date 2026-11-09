/** Validates optional decimal places before embedding them in SQL. */
export function validateDecimals(decimals: number | undefined): void {
  if (
    decimals !== undefined &&
    (!Number.isInteger(decimals) || decimals < 0 || decimals > 2147483647)
  ) {
    throw new Error("options.decimals must be a finite non-negative integer at most 2147483647.");
  }
}

/** Returns whether rounding can change a value of this DuckDB type. */
export function isFractionalType(type: string): boolean {
  return /^(FLOAT|REAL|DOUBLE|DECIMAL\(\d+,\d+\))$/.test(type);
}

/** Rounds a final numeric expression, leaving integers and nonnumeric types unchanged. */
export default function roundExpression(
  expression: string,
  decimals: number | undefined,
  type?: string,
): string {
  validateDecimals(decimals);
  if (decimals === undefined || (type !== undefined && !isFractionalType(type))) {
    return expression;
  }
  return `ROUND(${expression}, ${decimals})`;
}
