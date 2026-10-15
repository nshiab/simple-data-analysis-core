import { test, expect } from "vite-plus/test";

import buildFuzzyMatchSql from "../../../src/helpers/buildFuzzyMatchSql.ts";

test("builds a ratio match with length and prefix prefilters", () => {
  expect(
    buildFuzzyMatchSql("left_value", "right_value", "ratio", 80, {
      prefilterPrefixLength: 2,
    }),
  ).toStrictEqual({
    scoreExpression: "rapidfuzz_ratio(left_value, right_value)",
    condition:
      "rapidfuzz_ratio(left_value, right_value) >= 80 AND ABS(LENGTH(left_value) - LENGTH(right_value)) <= 0.3333333333333333 * GREATEST(LENGTH(left_value), LENGTH(right_value)) AND SUBSTR(left_value, 1, 2) = SUBSTR(right_value, 1, 2)",
  });
});

test("rounds the score used by non-ratio matches when requested", () => {
  expect(
    buildFuzzyMatchSql('"left"."name"', '"right"."name"', "token_set_ratio", 90, { decimals: 2 }),
  ).toStrictEqual({
    scoreExpression: 'ROUND(rapidfuzz_token_set_ratio("left"."name", "right"."name"), 2)',
    condition: 'ROUND(rapidfuzz_token_set_ratio("left"."name", "right"."name"), 2) >= 90',
  });
});
