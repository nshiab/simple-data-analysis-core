import { test, expect } from "vite-plus/test";

import camelCase from "../../../src/helpers/camelCase.ts";

test("camelCase - matches journalism-format core tests", () => {
  expect(camelCase("Journalism  _ % IS**@ aWeSoMe.")).toStrictEqual("journalismIsAwesome");
  expect(camelCase("hello world")).toStrictEqual("helloWorld");
  expect(camelCase("  --Some@Thing is- happening--  ")).toStrictEqual("someThingIsHappening");
  expect(camelCase("Journalism")).toStrictEqual("journalism");
});

test("camelCase - hyphenated strings", () => {
  expect(camelCase("foo-bar-baz")).toStrictEqual("fooBarBaz");
  expect(camelCase("foo-bar")).toStrictEqual("fooBar");
});

test("camelCase - underscore-separated", () => {
  expect(camelCase("foo_bar")).toStrictEqual("fooBar");
});

test("camelCase - mixed delimiters", () => {
  expect(camelCase("foo--bar")).toStrictEqual("fooBar");
  expect(camelCase("foo  bar")).toStrictEqual("fooBar");
  expect(camelCase("foo.bar.baz")).toStrictEqual("fooBarBaz");
});

test("camelCase - symbols as delimiters", () => {
  expect(camelCase("foo@bar")).toStrictEqual("fooBar");
  expect(camelCase("foo#bar")).toStrictEqual("fooBar");
});

test("camelCase - edge cases", () => {
  expect(camelCase("")).toStrictEqual("");
  expect(camelCase("A")).toStrictEqual("a");
  expect(camelCase("alreadyCamel")).toStrictEqual("alreadycamel");
  expect(camelCase("  spaces  ")).toStrictEqual("spaces");
  expect(camelCase("FOO BAR")).toStrictEqual("fooBar");
});
