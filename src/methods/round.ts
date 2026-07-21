import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function round(
  simpleTable: SimpleTable,
  columns: string | string[],
  options:
    | number
    | {
      decimals?: number;
      method?: "round" | "ceiling" | "floor";
    } = {},
) {
  const optionsNormalized = typeof options === "number"
    ? { decimals: options }
    : options;
  const cols = stringToArray(columns);
  const method = optionsNormalized.method?.toUpperCase() ?? "ROUND";
  const decimals = optionsNormalized.decimals ?? 0;

  queueOp(simpleTable, {
    kind: "fusable",
    method: "round()",
    parameters: { columns, options },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * REPLACE (${
        cols
          .map((c) =>
            method === "ROUND"
              ? `${method}(${quoteIdentifier(c)}, ${decimals}) AS ${
                quoteIdentifier(c)
              }`
              : `${method}(${quoteIdentifier(c)}) AS ${quoteIdentifier(c)}`
          )
          .join(", ")
      }) FROM ${input}`,
  });
}
