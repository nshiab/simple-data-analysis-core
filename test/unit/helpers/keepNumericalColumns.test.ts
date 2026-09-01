import { assertEquals } from "@std/assert";
import keepNumericalColumns from "../../../src/helpers/keepNumericalColumns.ts";

Deno.test("keepNumericalColumns() recognizes parameterized decimal types", () => {
  assertEquals(
    keepNumericalColumns({
      integer: "BIGINT",
      floatingPoint: "DOUBLE",
      decimal: "DECIMAL(10,2)",
      text: "VARCHAR",
    }),
    ["integer", "floatingPoint", "decimal"],
  );
});
