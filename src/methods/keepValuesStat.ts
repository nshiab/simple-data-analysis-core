import type SimpleTable from "../class/SimpleTable.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";

export default function keepValuesStat(
  simpleTable: SimpleTable,
  column: string,
  stat: "min" | "max",
  options: { by?: string | string[] } = {},
) {
  if (stat !== "min" && stat !== "max") {
    throw new Error('keepValuesStat() only supports "min" and "max".');
  }
  const by = stringToArray(options.by ?? []);
  const partition = by.length === 0 ? "" : `PARTITION BY ${by.map(quoteIdentifier).join(", ")}`;
  const target = quoteIdentifier(column);

  queueOp(simpleTable, {
    kind: "fusable",
    method: "keepValuesStat()",
    parameters: { column, stat, options: { by } },
    needsSchema: false,
    preservesSchema: true,
    buildSelect: (input) =>
      `SELECT * FROM ${input} QUALIFY ${target} = ${stat}(${target}) OVER (${partition})`,
  });
}
