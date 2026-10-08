import { assertEquals } from "@std/assert";
import wrapString from "../../../src/helpers/wrapString.ts";

Deno.test("wrapString - short string (no wrapping needed)", () => {
  const result = wrapString("Hello", 10);
  assertEquals(result, "Hello");
});

Deno.test("wrapString - wraps at word boundaries", () => {
  const result = wrapString(
    "This is a very long sentence that needs wrapping",
    20,
  );
  assertEquals(result, "This is a very long\nsentence that needs\nwrapping");
});

Deno.test("wrapString - breaks long words at character boundary", () => {
  const result = wrapString("Thisisaverylongword", 10);
  assertEquals(result, "Thisisaver\nylongword");
});

Deno.test("wrapString - character-based wrapping when wordWrap is false", () => {
  const result = wrapString("Thisisaverylongword", 10, false);
  assertEquals(result, "Thisisaver\nylongword");
});

Deno.test("wrapString - preserves whitespace", () => {
  const result = wrapString("Hello   world   test", 15);
  assertEquals(result, "Hello   world\n   test");
});

Deno.test("wrapString - empty string", () => {
  const result = wrapString("", 10);
  assertEquals(result, "");
});

Deno.test("wrapString - single word longer than maxWidth", () => {
  const result = wrapString("superlongword", 5);
  assertEquals(result, "super\nlongw\nord");
});

Deno.test("wrapString - maxWidth equals string length", () => {
  const result = wrapString("exactly", 7);
  assertEquals(result, "exactly");
});

Deno.test("wrapString - combining accents fit within the grapheme budget", () => {
  assertEquals(wrapString("e\u0301e\u0301", 2), "e\u0301e\u0301");
  assertEquals(wrapString("cafe\u0301 noir", 5), "cafe\u0301\nnoir");
});

Deno.test("wrapString - long words keep combining accents with their letters", () => {
  for (const wordWrap of [true, false]) {
    assertEquals(
      wrapString("abe\u0301cde\u0301f", 3, wordWrap),
      "abe\u0301\ncde\u0301\nf",
    );
    assertEquals(wrapString("a\u0301\u0327b", 1, wordWrap), "a\u0301\u0327\nb");
  }
});
