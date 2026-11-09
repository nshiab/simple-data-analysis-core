import { test, expect } from "vite-plus/test";
import roundExpression, { validateDecimals } from "../../../src/helpers/roundExpression.ts";

test("roundExpression rounds fractional outputs and preserves exact integers and nonnumeric values", () => {
  expect(roundExpression("AVG(value)", undefined)).toBe("AVG(value)");
  expect(roundExpression("AVG(value)", 0)).toBe("ROUND(AVG(value), 0)");
  expect(roundExpression("SUM(value)", 2, "DECIMAL(38,4)")).toBe("ROUND(SUM(value), 2)");
  for (const type of ["BIGINT", "HUGEINT", "BIGNUM", "VARCHAR", "DATE", "TIMESTAMP_NS"]) {
    expect(roundExpression("value", 2, type)).toBe("value");
  }
});

test("decimal places must be finite non-negative integers supported by DuckDB", () => {
  for (const decimals of [NaN, Infinity, -1, 0.5, 2147483648]) {
    expect(() => validateDecimals(decimals)).toThrow(/options\.decimals/);
  }
  validateDecimals(undefined);
  validateDecimals(0);
  validateDecimals(2);
});
