import { test, expect } from "vite-plus/test";
import { assertThrows } from "../../helpers/assertions.ts";

import parseType from "../../../src/helpers/parseTypes.ts";

test("parseType normalizes JSON and fixed-size float vectors without changing scalar float", () => {
  expect(parseType("json")).toStrictEqual("JSON");
  expect(parseType("JSON")).toStrictEqual("JSON");
  expect(parseType("float[3]")).toStrictEqual("FLOAT[3]");
  expect(parseType("FLOAT[1536]")).toStrictEqual("FLOAT[1536]");
  expect(parseType("float")).toStrictEqual("DOUBLE");
  expect(parseType("geometry('EPSG:4326')")).toStrictEqual("GEOMETRY('EPSG:4326')");
});

test("parseType rejects invalid fixed-size float vector dimensions", () => {
  for (const type of [
    "FLOAT[0]",
    "FLOAT[-1]",
    "FLOAT[1.5]",
    "FLOAT[NaN]",
    "FLOAT[]",
    "FLOAT[3]; SELECT 1",
  ]) {
    assertThrows(() => parseType(type as Parameters<typeof parseType>[0]), Error, "Unknown type");
  }
});
