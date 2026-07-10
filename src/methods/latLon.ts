import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function latLon(
  simpleTable: SimpleTable,
  column: string,
  latColumn: string,
  lonColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "latLon()",
    parameters: { column, latColumn, lonColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [latColumn, lonColumn], "latLon()");
      return `SELECT *, CAST(ST_Y("${column}") AS DOUBLE) AS "${latColumn}", CAST(ST_X("${column}") AS DOUBLE) AS "${lonColumn}" FROM ${input}`;
    },
  });
}
