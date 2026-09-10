import { assertEquals, assertThrows } from "@std/assert";
import prepareJSON from "../../../src/helpers/prepareJSON.ts";

Deno.test("prepareJSON preserves JSON values, signed zero, and shared references", () => {
  const shared = { text: '"-0"\n', values: [-0, 1.0000000000000002, null] };
  const input = { a: shared, b: shared, flag: true, text: '{"x":1}' };
  assertEquals(JSON.parse(prepareJSON(input, "doc", 1)!), input);
  assertEquals(prepareJSON(null, "doc", 1), null);
  assertEquals(prepareJSON(undefined, "doc", 1), null);
});

Deno.test("prepareJSON rejects values that JSON serialization would omit or coerce", () => {
  const cycle: Record<string, unknown> = {};
  cycle.self = cycle;
  const sparse = new Array(2);
  const extra = Object.assign([1], { note: "lost" });
  for (
    const invalid of [
      undefined,
      NaN,
      Infinity,
      -Infinity,
      1n,
      Symbol("value"),
      () => 1,
      new Date(),
      new Map(),
      new Set(),
      new Uint8Array([1]),
      { toJSON: () => "replaced" },
      { [Symbol("key")]: 1 },
      sparse,
      extra,
      cycle,
    ]
  ) {
    assertThrows(
      () => prepareJSON({ invalid }, "payload", 7),
      Error,
      'Column "payload", row 7, $["invalid"]',
    );
  }
});

Deno.test("prepareJSON bounds nesting and supports plain objects without a prototype", () => {
  let value: unknown = Object.assign(Object.create(null), { value: 1 });
  assertEquals(prepareJSON(value, "doc", 1), '{"value":1}');
  for (let i = 1; i < 100; i++) value = [value];
  assertEquals(typeof prepareJSON(value, "doc", 1), "string");
  assertThrows(
    () => prepareJSON([value], "doc", 1),
    Error,
    "at most 100 levels",
  );
});
