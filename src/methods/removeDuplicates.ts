import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function removeDuplicates(
  simpleTable: SimpleTable,
  options: {
    on?: string | string[];
  } = {},
) {
  const columnsOn = options.on ? stringToArray(options.on) : null;
  const distinct = columnsOn
    ? `DISTINCT ON(${columnsOn.map((d) => `"${d}"`).join(",")}) *`
    : "DISTINCT *";

  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeDuplicates()",
    parameters: { options },
    needsSchema: false,
    buildSelect: (input) => `SELECT ${distinct} FROM ${input}`,
  });
}
