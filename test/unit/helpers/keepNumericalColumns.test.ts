import { test, expect } from "vite-plus/test";

import keepNumericalColumns from "../../../src/helpers/keepNumericalColumns.ts";

test("keepNumericalColumns() recognizes parameterized decimal types", () => {
  expect(
    keepNumericalColumns({
      integer: "BIGINT",
      floatingPoint: "DOUBLE",
      decimal: "DECIMAL(10,2)",
      text: "VARCHAR",
    }),
  ).toStrictEqual(["integer", "floatingPoint", "decimal"]);
});
