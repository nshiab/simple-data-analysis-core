import { assertEquals, assertThrows } from "@std/assert";
import parseType from "../../../src/helpers/parseTypes.ts";

Deno.test("parseType normalizes JSON and fixed-size float vectors without changing scalar float", () => {
  assertEquals(parseType("json"), "JSON");
  assertEquals(parseType("JSON"), "JSON");
  assertEquals(parseType("float[3]"), "FLOAT[3]");
  assertEquals(parseType("FLOAT[1536]"), "FLOAT[1536]");
  assertEquals(parseType("float"), "DOUBLE");
  assertEquals(parseType("geometry('EPSG:4326')"), "GEOMETRY('EPSG:4326')");
});

Deno.test("parseType rejects invalid fixed-size float vector dimensions", () => {
  for (
    const type of [
      "FLOAT[0]",
      "FLOAT[-1]",
      "FLOAT[1.5]",
      "FLOAT[NaN]",
      "FLOAT[]",
      "FLOAT[3]; SELECT 1",
    ]
  ) {
    assertThrows(
      () => parseType(type as Parameters<typeof parseType>[0]),
      Error,
      "Unknown type",
    );
  }
});
