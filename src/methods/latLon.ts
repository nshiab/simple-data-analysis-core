import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function latLon(
  simpleTable: SimpleTable,
  column: string,
  columnLat: string,
  columnLon: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "latLon()",
    parameters: { column, columnLat, columnLon },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [columnLat, columnLon], "latLon()");
      return `SELECT *, CAST(ST_Y("${column}") AS DOUBLE) AS "${columnLat}", CAST(ST_X("${column}") AS DOUBLE) AS "${columnLon}" FROM ${input}`;
    },
  });
}
