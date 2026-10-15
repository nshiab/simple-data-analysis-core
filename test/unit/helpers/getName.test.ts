import { test, expect } from "vite-plus/test";

import getName from "../../../src/helpers/getName.ts";

test("should return the file name without extension for a simple file path", function () {
  const result = getName("example.txt");
  expect(result).toStrictEqual("example");
});

test("should return the file name without extension for a nested file path", function () {
  const result = getName("path/to/example.txt");
  expect(result).toStrictEqual("example");
});

test("should return the file name without extension for a file with multiple dots", function () {
  const result = getName("path/to/example.test.js");
  expect(result).toStrictEqual("example.test");
});

test("should return an empty string for a file with no name but only extension", function () {
  const result = getName("path/to/.hiddenfile");
  expect(result).toStrictEqual("");
});

test("should handle paths with no extension", function () {
  const result = getName("path/to/example");
  expect(result).toStrictEqual("example");
});
