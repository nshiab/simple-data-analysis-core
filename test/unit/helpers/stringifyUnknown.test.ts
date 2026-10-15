import { test, expect } from "vite-plus/test";
import stringifyUnknown from "../../../src/helpers/stringifyUnknown.ts";
import parseValue from "../../../src/helpers/parseValue.ts";
import { prepareArray } from "../../../src/methods/loadArray.ts";

test("string conversion preserves each primitive hint and direct symbol contract", () => {
  const value = {
    [Symbol.toPrimitive](hint: string) {
      return hint;
    },
  };
  expect(stringifyUnknown(value, "template")).toBe("string");
  expect(stringifyUnknown(value)).toBe("string");
  expect(stringifyUnknown(value, "default")).toBe("default");
  expect(stringifyUnknown(Symbol("value"))).toBe("Symbol(value)");
  expect(() => stringifyUnknown(Symbol("value"), "template")).toThrow(TypeError);
  expect(() => stringifyUnknown(Symbol("value"), "default")).toThrow(TypeError);
});

test("diagnostic interpolation prefers toString before valueOf", () => {
  const value = {
    toString() {
      return "diagnostic text";
    },
    valueOf() {
      throw new Error("valueOf must not run for string interpolation");
    },
  };
  expect(() => parseValue(value)).toThrow("Unknown type object of diagnostic text.");
  expect(() => prepareArray([{ value }])).toThrow(
    "Type object not supported for value. Value: diagnostic text",
  );
  expect(() => parseValue(Symbol("value"))).toThrow(TypeError);
  expect(() => prepareArray([{ value: Symbol("value") }])).toThrow(TypeError);
});
