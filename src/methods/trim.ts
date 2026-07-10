import stringToArray from "../helpers/stringToArray.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function trim(
  simpleTable: SimpleTable,
  columns: string | string[],
  options: {
    character?: string;
    side?: "left" | "right" | "both";
  } = {},
) {
  const cols = stringToArray(columns);
  const side = options.side ?? "both";
  const fn = side === "left"
    ? "LTRIM"
    : side === "right"
    ? "RTRIM"
    : side === "both"
    ? "TRIM"
    : null;
  if (fn === null) {
    throw new Error(`Unknown side ${options.side}`);
  }
  const specialCharacter = typeof options.character === "string"
    ? `, '${options.character}'`
    : "";

  queueOp(simpleTable, {
    kind: "fusable",
    method: "trim()",
    parameters: { columns, options },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (${
        cols
          .map((c) => `${fn}("${c}"${specialCharacter}) AS "${c}"`)
          .join(", ")
      }) FROM ${input}`,
  });
}
