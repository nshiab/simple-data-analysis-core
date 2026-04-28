import { assertEquals } from "@std/assert";
import formatNumber from "../../../src/helpers/formatNumber.ts";

// Basic formatting with thousands separator
Deno.test("formatNumber - basic number as string", () => {
  assertEquals(formatNumber(10), "10");
});

Deno.test("formatNumber - thousands separator (1000)", () => {
  assertEquals(formatNumber(1000), "1,000");
});

Deno.test("formatNumber - thousands separator (10000)", () => {
  assertEquals(formatNumber(10000), "10,000");
});

Deno.test("formatNumber - thousands separator (100000)", () => {
  assertEquals(formatNumber(100000), "100,000");
});

Deno.test("formatNumber - thousands separator with decimals", () => {
  assertEquals(formatNumber(1234567.89), "1,234,567.89");
});

// Decimals option
Deno.test("formatNumber - decimals: 1", () => {
  assertEquals(formatNumber(123.456, { decimals: 1 }), "123.5");
});

Deno.test("formatNumber - decimals: 2", () => {
  assertEquals(formatNumber(1.5345, { decimals: 2 }), "1.53");
});

Deno.test("formatNumber - decimals: 0", () => {
  assertEquals(formatNumber(1.5345, { decimals: 0 }), "2");
});

// Significant digits option
Deno.test("formatNumber - significantDigits: 3", () => {
  assertEquals(formatNumber(66.666, { significantDigits: 3 }), "66.7");
});

Deno.test("formatNumber - significantDigits: 2", () => {
  assertEquals(formatNumber(0.01578, { significantDigits: 2 }), "0.016");
});

Deno.test("formatNumber - significantDigits: 1", () => {
  assertEquals(formatNumber(0.01578, { significantDigits: 1 }), "0.02");
});

// Suffix option
Deno.test("formatNumber - suffix", () => {
  assertEquals(formatNumber(35, { suffix: " C" }), "35 C");
});

Deno.test("formatNumber - suffix percentage with significantDigits", () => {
  assertEquals(
    formatNumber(66.666, { significantDigits: 3, suffix: "%" }),
    "66.7%",
  );
});

Deno.test("formatNumber - suffix percentage with significantDigits 2", () => {
  assertEquals(
    formatNumber(1.3922092532695824, { significantDigits: 2, suffix: "%" }),
    "1.4%",
  );
});

// Prefix option
Deno.test("formatNumber - prefix", () => {
  assertEquals(formatNumber(35, { prefix: "Temp.: " }), "Temp.: 35");
});

Deno.test("formatNumber - prefix and suffix", () => {
  assertEquals(
    formatNumber(35, { prefix: "Temp.: ", suffix: " C" }),
    "Temp.: 35 C",
  );
});

Deno.test("formatNumber - dollar prefix", () => {
  assertEquals(
    formatNumber(98.765, { decimals: 2, prefix: "$", suffix: " CAD" }),
    "$98.77 CAD",
  );
});

// Abbreviation option
Deno.test("formatNumber - abbreviation: true (no change for small numbers)", () => {
  assertEquals(formatNumber(15, { abbreviation: true }), "15");
});

Deno.test("formatNumber - abbreviation to K", () => {
  assertEquals(formatNumber(12000, { abbreviation: true }), "12K");
});

Deno.test("formatNumber - abbreviation to K (1.5K)", () => {
  assertEquals(formatNumber(1500, { abbreviation: true }), "1.5K");
});

Deno.test("formatNumber - abbreviation to M", () => {
  assertEquals(formatNumber(1500000, { abbreviation: true }), "1.5M");
});

Deno.test("formatNumber - abbreviation to B", () => {
  assertEquals(formatNumber(1500000000, { abbreviation: true }), "1.5B");
});

Deno.test("formatNumber - abbreviation to T", () => {
  assertEquals(formatNumber(1500000000000, { abbreviation: true }), "1.5T");
});

Deno.test("formatNumber - negative abbreviation to K", () => {
  assertEquals(formatNumber(-1500, { abbreviation: true }), "-1.5K");
});

Deno.test("formatNumber - negative abbreviation to M", () => {
  assertEquals(formatNumber(-1500000, { abbreviation: true }), "-1.5M");
});

Deno.test("formatNumber - abbreviation with prefix and suffix", () => {
  assertEquals(
    formatNumber(1500, { abbreviation: true, prefix: "$", suffix: " USD" }),
    "$1.5K USD",
  );
});

Deno.test("formatNumber - negative abbreviation with prefix and suffix", () => {
  assertEquals(
    formatNumber(-1500, { abbreviation: true, prefix: "$", suffix: " USD" }),
    "-$1.5K USD",
  );
});

Deno.test("formatNumber - abbreviation with decimals", () => {
  assertEquals(
    formatNumber(1525, {
      abbreviation: true,
      decimals: 2,
      prefix: "$",
      suffix: " USD",
    }),
    "$1.52K USD",
  );
});

Deno.test("formatNumber - abbreviation with 0 decimals", () => {
  assertEquals(
    formatNumber(1525, {
      abbreviation: true,
      decimals: 0,
      prefix: "$",
      suffix: " USD",
    }),
    "$2K USD",
  );
});

Deno.test("formatNumber - abbreviation with 0 returns 0", () => {
  assertEquals(
    formatNumber(0, {
      abbreviation: true,
      decimals: 0,
      prefix: "$",
      suffix: " USD",
    }),
    "$0 USD",
  );
});

// Edge cases
Deno.test("formatNumber - negative numbers", () => {
  assertEquals(formatNumber(-456), "-456");
});

Deno.test("formatNumber - negative with decimals", () => {
  assertEquals(formatNumber(-1.5345, { decimals: 2 }), "-1.53");
});

Deno.test("formatNumber - negative with abbreviation", () => {
  assertEquals(
    formatNumber(-1525, {
      abbreviation: true,
      decimals: 2,
      prefix: "$",
      suffix: " USD",
    }),
    "-$1.52K USD",
  );
});

Deno.test("formatNumber - zero", () => {
  assertEquals(formatNumber(0), "0");
});

Deno.test("formatNumber - throws for non-number", () => {
  let error = null;
  try {
    // @ts-expect-error - testing invalid input
    formatNumber("abc");
  } catch (e) {
    error = e;
  }
  assertEquals(error instanceof Error, true);
});
