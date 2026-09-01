import { assertEquals } from "@std/assert";
import buildFuzzyMatchSql from "../../../src/helpers/buildFuzzyMatchSql.ts";

Deno.test("builds a ratio match with length and prefix prefilters", () => {
  assertEquals(
    buildFuzzyMatchSql("left_value", "right_value", "ratio", 80, {
      prefilterPrefixLength: 2,
    }),
    {
      scoreExpression: "rapidfuzz_ratio(left_value, right_value)",
      condition:
        "rapidfuzz_ratio(left_value, right_value) >= 80 AND ABS(LENGTH(left_value) - LENGTH(right_value)) <= 0.3333333333333333 * GREATEST(LENGTH(left_value), LENGTH(right_value)) AND SUBSTR(left_value, 1, 2) = SUBSTR(right_value, 1, 2)",
    },
  );
});

Deno.test("rounds the score used by non-ratio matches when requested", () => {
  assertEquals(
    buildFuzzyMatchSql(
      '"left"."name"',
      '"right"."name"',
      "token_set_ratio",
      90,
      { decimals: 2 },
    ),
    {
      scoreExpression:
        'ROUND(rapidfuzz_token_set_ratio("left"."name", "right"."name"), 2)',
      condition:
        'ROUND(rapidfuzz_token_set_ratio("left"."name", "right"."name"), 2) >= 90',
    },
  );
});
