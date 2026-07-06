import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function sample(
  simpleTable: SimpleTable,
  quantity: number | string,
  options: {
    seed?: number;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "sample()",
    parameters: { quantity, options },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT * FROM ${input} USING SAMPLE RESERVOIR(${
        typeof quantity === "number" ? `${quantity} ROWS` : quantity
      })${
        typeof options.seed === "number" ? ` REPEATABLE(${options.seed})` : ""
      }`,
  });
}
