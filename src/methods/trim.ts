import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function trim(
  simpleTable: SimpleTable,
  columns: string | string[],
  options: {
    character?: string;
    method?: "leftTrim" | "rightTrim" | "trim";
  } = {},
) {
  const cols = stringToArray(columns);
  const method = options.method ?? "trim";
  const fn = method === "leftTrim"
    ? "LTRIM"
    : method === "rightTrim"
    ? "RTRIM"
    : method === "trim"
    ? "TRIM"
    : null;
  if (fn === null) {
    throw new Error(`Unknown method ${options.method}`);
  }
  const specialCharacter = typeof options.character === "string"
    ? `, '${options.character}'`
    : "";

  simpleTable.pendingOps.push({
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
