import { test, expect } from "vite-plus/test";

import wrapString from "../../../src/helpers/wrapString.ts";

test("wrapString - short string (no wrapping needed)", () => {
  const result = wrapString("Hello", 10);
  expect(result).toStrictEqual("Hello");
});

test("wrapString - wraps at word boundaries", () => {
  const result = wrapString("This is a very long sentence that needs wrapping", 20);
  expect(result).toStrictEqual("This is a very long\nsentence that needs\nwrapping");
});

test("wrapString - breaks long words at character boundary", () => {
  const result = wrapString("Thisisaverylongword", 10);
  expect(result).toStrictEqual("Thisisaver\nylongword");
});

test("wrapString - character-based wrapping when wordWrap is false", () => {
  const result = wrapString("Thisisaverylongword", 10, false);
  expect(result).toStrictEqual("Thisisaver\nylongword");
});

test("wrapString - preserves whitespace", () => {
  const result = wrapString("Hello   world   test", 15);
  expect(result).toStrictEqual("Hello   world\n   test");
});

test("wrapString - empty string", () => {
  const result = wrapString("", 10);
  expect(result).toStrictEqual("");
});

test("wrapString - single word longer than maxWidth", () => {
  const result = wrapString("superlongword", 5);
  expect(result).toStrictEqual("super\nlongw\nord");
});

test("wrapString - maxWidth equals string length", () => {
  const result = wrapString("exactly", 7);
  expect(result).toStrictEqual("exactly");
});

test("wrapString - combining accents fit within the grapheme budget", () => {
  expect(wrapString("e\u0301e\u0301", 2)).toStrictEqual("e\u0301e\u0301");
  expect(wrapString("cafe\u0301 noir", 5)).toStrictEqual("cafe\u0301\nnoir");
});

test("wrapString - long words keep combining accents with their letters", () => {
  for (const wordWrap of [true, false]) {
    expect(wrapString("abe\u0301cde\u0301f", 3, wordWrap)).toStrictEqual("abe\u0301\ncde\u0301\nf");
    expect(wrapString("a\u0301\u0327b", 1, wordWrap)).toStrictEqual("a\u0301\u0327\nb");
  }
});
