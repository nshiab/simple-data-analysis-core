import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test, expect } from "vite-plus/test";

import extractTypes from "../../../src/helpers/extractTypes.ts";

test("extractTypes preserves schema entries and empty input", () => {
  expect(extractTypes(null)).toStrictEqual({});
  expect(extractTypes([])).toStrictEqual({});
  expect(
    extractTypes([
      { column_name: "feature", column_type: "FLOAT" },
      { column_name: "constructor", column_type: "INTEGER" },
    ]),
  ).toStrictEqual({ feature: "FLOAT", constructor: "INTEGER" });
});

test("extractTypes preserves prototype-named columns in Node schema dictionaries", async () => {
  const module = new URL("../../../src/helpers/extractTypes.ts", import.meta.url);
  const result = await promisify(execFile)(process.execPath, [
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
  ]);
  expect(result.stderr).toStrictEqual("");
});
