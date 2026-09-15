import { assertEquals } from "@std/assert";
import extractTypes from "../../../src/helpers/extractTypes.ts";

Deno.test("extractTypes preserves schema entries and empty input", () => {
  assertEquals(extractTypes(null), {});
  assertEquals(extractTypes([]), {});
  assertEquals(
    extractTypes([
      { column_name: "feature", column_type: "FLOAT" },
      { column_name: "constructor", column_type: "INTEGER" },
    ]),
    { feature: "FLOAT", constructor: "INTEGER" },
  );
});

Deno.test("extractTypes preserves prototype-named columns in Node schema dictionaries", async () => {
  const module = new URL(
    "../../../src/helpers/extractTypes.ts",
    import.meta.url,
  );
  const result = await new Deno.Command("node", {
    args: [
      "--experimental-strip-types",
      "--input-type=module",
      "--eval",
      `import { strict as assert } from "node:assert";
      import extractTypes from ${JSON.stringify(module.href)};
      const types = extractTypes([
        { column_name: "__proto__", column_type: "DOUBLE" },
        { column_name: "constructor", column_type: "INTEGER" }
      ]);
      assert.deepEqual(Object.keys(types), ["__proto__", "constructor"]);
      assert.equal(types["__proto__"], "DOUBLE");
      assert.equal(types.constructor, "INTEGER");
      assert.equal(Object.getPrototypeOf(types), Object.prototype);`,
    ],
    stdout: "piped",
    stderr: "piped",
  }).output();
  assertEquals(result.code, 0, new TextDecoder().decode(result.stderr));
});
