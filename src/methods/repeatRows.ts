import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function repeatRows(
  simpleTable: SimpleTable,
  column: string,
  options: { index?: string } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "repeatRows()",
    parameters: { column, options },
    needsSchema: false,
    buildSelect: (input) =>
      options.index
        ? `SELECT *, UNNEST(range(CAST("${column}" AS BIGINT))) AS "${options.index}" FROM ${input}`
        : `SELECT * EXCLUDE (_index) FROM (SELECT *, UNNEST(range(CAST("${column}" AS BIGINT))) AS _index FROM ${input})`,
  });
}
