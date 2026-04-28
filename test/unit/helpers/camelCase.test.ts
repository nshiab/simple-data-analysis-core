import { assertEquals } from "@std/assert";
import camelCase from "../../../src/helpers/camelCase.ts";

Deno.test("camelCase - matches journalism-format core tests", () => {
  assertEquals(
    camelCase("Journalism  _ % IS**@ aWeSoMe."),
    "journalismIsAwesome",
  );
  assertEquals(camelCase("hello world"), "helloWorld");
  assertEquals(
    camelCase("  --Some@Thing is- happening--  "),
    "someThingIsHappening",
  );
  assertEquals(camelCase("Journalism"), "journalism");
});

Deno.test("camelCase - hyphenated strings", () => {
  assertEquals(camelCase("foo-bar-baz"), "fooBarBaz");
  assertEquals(camelCase("foo-bar"), "fooBar");
});

Deno.test("camelCase - underscore-separated", () => {
  assertEquals(camelCase("foo_bar"), "fooBar");
});

Deno.test("camelCase - mixed delimiters", () => {
  assertEquals(camelCase("foo--bar"), "fooBar");
  assertEquals(camelCase("foo  bar"), "fooBar");
  assertEquals(camelCase("foo.bar.baz"), "fooBarBaz");
});

Deno.test("camelCase - symbols as delimiters", () => {
  assertEquals(camelCase("foo@bar"), "fooBar");
  assertEquals(camelCase("foo#bar"), "fooBar");
});

Deno.test("camelCase - edge cases", () => {
  assertEquals(camelCase(""), "");
  assertEquals(camelCase("A"), "a");
  assertEquals(camelCase("alreadyCamel"), "alreadycamel");
  assertEquals(camelCase("  spaces  "), "spaces");
  assertEquals(camelCase("FOO BAR"), "fooBar");
});
