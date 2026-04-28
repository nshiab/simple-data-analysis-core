import { assertEquals } from "@std/assert";
import capitalize from "../../../src/helpers/capitalize.ts";

Deno.test("capitalize - basic usage", () => {
  const result = capitalize("hello world");
  assertEquals(result, "Hello world");
});

Deno.test("capitalize - already capitalized string", () => {
  const result = capitalize("Journalism");
  assertEquals(result, "Journalism");
});

Deno.test("capitalize - single character", () => {
  const result = capitalize("a");
  assertEquals(result, "A");
});

Deno.test("capitalize - empty string", () => {
  const result = capitalize("");
  assertEquals(result, "");
});
