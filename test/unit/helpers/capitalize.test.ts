import { test, expect } from "vite-plus/test";

import capitalize from "../../../src/helpers/capitalize.ts";

test("capitalize - basic usage", () => {
  const result = capitalize("hello world");
  expect(result).toStrictEqual("Hello world");
});

test("capitalize - already capitalized string", () => {
  const result = capitalize("Journalism");
  expect(result).toStrictEqual("Journalism");
});

test("capitalize - single character", () => {
  const result = capitalize("a");
  expect(result).toStrictEqual("A");
});

test("capitalize - empty string", () => {
  const result = capitalize("");
  expect(result).toStrictEqual("");
});
