import { test, expect } from "vite-plus/test";

import formatNumber from "../../../src/helpers/formatNumber.ts";

// Basic formatting with thousands separator
test("formatNumber - basic number as string", () => {
  expect(formatNumber(10)).toStrictEqual("10");
});

test("formatNumber - thousands separator (1000)", () => {
  expect(formatNumber(1000)).toStrictEqual("1,000");
});

test("formatNumber - thousands separator (10000)", () => {
  expect(formatNumber(10000)).toStrictEqual("10,000");
});

test("formatNumber - thousands separator (100000)", () => {
  expect(formatNumber(100000)).toStrictEqual("100,000");
});

test("formatNumber - thousands separator with decimals", () => {
  expect(formatNumber(1234567.89)).toStrictEqual("1,234,567.89");
});

// Decimals option
test("formatNumber - decimals: 1", () => {
  expect(formatNumber(123.456, { decimals: 1 })).toStrictEqual("123.5");
});

test("formatNumber - decimals: 2", () => {
  expect(formatNumber(1.5345, { decimals: 2 })).toStrictEqual("1.53");
});

test("formatNumber - decimals: 0", () => {
  expect(formatNumber(1.5345, { decimals: 0 })).toStrictEqual("2");
});

// Significant digits option
test("formatNumber - significantDigits: 3", () => {
  expect(formatNumber(66.666, { significantDigits: 3 })).toStrictEqual("66.7");
});

test("formatNumber - significantDigits: 2", () => {
  expect(formatNumber(0.01578, { significantDigits: 2 })).toStrictEqual("0.016");
});

test("formatNumber - significantDigits: 1", () => {
  expect(formatNumber(0.01578, { significantDigits: 1 })).toStrictEqual("0.02");
});

// Suffix option
test("formatNumber - suffix", () => {
  expect(formatNumber(35, { suffix: " C" })).toStrictEqual("35 C");
});

test("formatNumber - suffix percentage with significantDigits", () => {
  expect(formatNumber(66.666, { significantDigits: 3, suffix: "%" })).toStrictEqual("66.7%");
});

test("formatNumber - suffix percentage with significantDigits 2", () => {
  expect(formatNumber(1.3922092532695824, { significantDigits: 2, suffix: "%" })).toStrictEqual(
    "1.4%",
  );
});

// Prefix option
test("formatNumber - prefix", () => {
  expect(formatNumber(35, { prefix: "Temp.: " })).toStrictEqual("Temp.: 35");
});

test("formatNumber - prefix and suffix", () => {
  expect(formatNumber(35, { prefix: "Temp.: ", suffix: " C" })).toStrictEqual("Temp.: 35 C");
});

test("formatNumber - dollar prefix", () => {
  expect(formatNumber(98.765, { decimals: 2, prefix: "$", suffix: " CAD" })).toStrictEqual(
    "$98.77 CAD",
  );
});

// Abbreviation option
test("formatNumber - abbreviation: true (no change for small numbers)", () => {
  expect(formatNumber(15, { abbreviation: true })).toStrictEqual("15");
});

test("formatNumber - abbreviation to K", () => {
  expect(formatNumber(12000, { abbreviation: true })).toStrictEqual("12K");
});

test("formatNumber - abbreviation to K (1.5K)", () => {
  expect(formatNumber(1500, { abbreviation: true })).toStrictEqual("1.5K");
});

test("formatNumber - abbreviation to M", () => {
  expect(formatNumber(1500000, { abbreviation: true })).toStrictEqual("1.5M");
});

test("formatNumber - abbreviation to B", () => {
  expect(formatNumber(1500000000, { abbreviation: true })).toStrictEqual("1.5B");
});

test("formatNumber - abbreviation to T", () => {
  expect(formatNumber(1500000000000, { abbreviation: true })).toStrictEqual("1.5T");
});

test("formatNumber - negative abbreviation to K", () => {
  expect(formatNumber(-1500, { abbreviation: true })).toStrictEqual("-1.5K");
});

test("formatNumber - negative abbreviation to M", () => {
  expect(formatNumber(-1500000, { abbreviation: true })).toStrictEqual("-1.5M");
});

test("formatNumber - abbreviation with prefix and suffix", () => {
  expect(formatNumber(1500, { abbreviation: true, prefix: "$", suffix: " USD" })).toStrictEqual(
    "$1.5K USD",
  );
});

test("formatNumber - negative abbreviation with prefix and suffix", () => {
  expect(formatNumber(-1500, { abbreviation: true, prefix: "$", suffix: " USD" })).toStrictEqual(
    "-$1.5K USD",
  );
});

test("formatNumber - abbreviation with decimals", () => {
  expect(
    formatNumber(1525, {
      abbreviation: true,
      decimals: 2,
      prefix: "$",
      suffix: " USD",
    }),
  ).toStrictEqual("$1.52K USD");
});

test("formatNumber - abbreviation with 0 decimals", () => {
  expect(
    formatNumber(1525, {
      abbreviation: true,
      decimals: 0,
      prefix: "$",
      suffix: " USD",
    }),
  ).toStrictEqual("$2K USD");
});

test("formatNumber - abbreviation with 0 returns 0", () => {
  expect(
    formatNumber(0, {
      abbreviation: true,
      decimals: 0,
      prefix: "$",
      suffix: " USD",
    }),
  ).toStrictEqual("$0 USD");
});

// Edge cases
test("formatNumber - negative numbers", () => {
  expect(formatNumber(-456)).toStrictEqual("-456");
});

test("formatNumber - negative with decimals", () => {
  expect(formatNumber(-1.5345, { decimals: 2 })).toStrictEqual("-1.53");
});

test("formatNumber - negative with abbreviation", () => {
  expect(
    formatNumber(-1525, {
      abbreviation: true,
      decimals: 2,
      prefix: "$",
      suffix: " USD",
    }),
  ).toStrictEqual("-$1.52K USD");
});

test("formatNumber - zero", () => {
  expect(formatNumber(0)).toStrictEqual("0");
});

test("formatNumber - throws for non-number", () => {
  let error = null;
  try {
    // @ts-expect-error - testing invalid input
    formatNumber("abc");
  } catch (e) {
    error = e;
  }
  expect(error instanceof Error).toStrictEqual(true);
});
