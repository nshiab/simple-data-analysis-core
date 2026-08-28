import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function sample(
  simpleTable: SimpleTable,
  count: number | string,
  options: {
    seed?: number;
  } = {},
) {
  options = { ...options };
  queueOp(simpleTable, {
    kind: "fusable",
    method: "sample()",
    parameters: { count, options },
    needsSchema: false,
    // Seeded reservoir sampling returns a stable row order from a materialized
    // table, but DuckDB can emit those rows in a different order when the
    // sampler consumes a file scan directly.
    requiresMaterializedInput: true,
    preservesSchema: true,
    buildSelect: (input) =>
      `SELECT * FROM ${input} USING SAMPLE RESERVOIR(${
        typeof count === "number" ? `${count} ROWS` : count
      })${
        typeof options.seed === "number" ? ` REPEATABLE(${options.seed})` : ""
      }`,
  });
}
