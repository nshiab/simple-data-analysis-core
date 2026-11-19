import { expect, test } from "vite-plus/test";
import requireColumn from "../../../src/helpers/requireColumn.ts";

test("requireColumn returns the original name and type using DuckDB identifier matching", () => {
  expect(requireColumn({ Scores: "INTEGER[]" }, "SCORES", "unnest()")).toStrictEqual({
    name: "Scores",
    type: "INTEGER[]",
  });
});

test("requireColumn names the calling method and missing column", () => {
  expect(() => requireColumn({ scores: "INTEGER[]" }, "missing", "unnest()")).toThrow(
    'unnest() column "missing" does not exist. Check the column name.',
  );
});
