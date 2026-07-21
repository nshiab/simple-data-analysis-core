import quoteIdentifier from "../helpers/quoteIdentifier.ts";
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
  const specialCharacter = typeof options.character === "string" ? ", ?" : "";

  queueOp(simpleTable, {
    kind: "fusable",
    method: "trim()",
    parameters: { columns, options },
    values: typeof options.character === "string"
      ? cols.map(() => options.character!)
      : undefined,
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (${
        cols
          .map((c) =>
            `${fn}(${quoteIdentifier(c)}${specialCharacter}) AS ${
              quoteIdentifier(c)
            }`
          )
          .join(", ")
      }) FROM ${input}`,
  });
}
