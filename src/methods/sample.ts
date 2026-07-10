import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function sample(
  simpleTable: SimpleTable,
  count: number | string,
  options: {
    seed?: number;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "sample()",
    parameters: { count, options },
    needsSchema: false,
    preservesSchema: true,
    buildSelect: (input) =>
      `SELECT * FROM ${input} USING SAMPLE RESERVOIR(${
        typeof count === "number" ? `${count} ROWS` : count
      })${
        typeof options.seed === "number" ? ` REPEATABLE(${options.seed})` : ""
      }`,
  });
}
