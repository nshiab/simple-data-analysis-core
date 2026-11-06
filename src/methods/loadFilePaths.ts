import { resolve } from "node:path";
import type SimpleTable from "../class/SimpleTable.ts";
import parseValue from "../helpers/parseValue.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";

export default function loadFilePaths(table: SimpleTable, patterns: string | string[]): void {
  const absolutePatterns = stringToArray(patterns).map((pattern) => parseValue(resolve(pattern)));
  queueOp(table, {
    kind: "source",
    method: "loadFilePaths()",
    parameters: { patterns },
    schema: { path: "VARCHAR" },
    buildSelect: () =>
      `SELECT DISTINCT file AS path FROM glob([${absolutePatterns.join(", ")}]::VARCHAR[])`,
  });
}
