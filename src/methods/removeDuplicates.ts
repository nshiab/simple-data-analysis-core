import quoteIdentifier from "../helpers/quoteIdentifier.ts";
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
    ? `DISTINCT ON(${
      columnsOn.map((d) => `${quoteIdentifier(d)}`).join(",")
    }) *`
    : "DISTINCT *";

  queueOp(simpleTable, {
    kind: "fusable",
    method: "removeDuplicates()",
    parameters: { options },
    needsSchema: false,
    preservesSchema: true,
    buildSelect: (input) => `SELECT ${distinct} FROM ${input}`,
  });
}
