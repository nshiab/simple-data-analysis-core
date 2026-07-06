import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function points(
  simpleTable: SimpleTable,
  columnLat: string,
  columnLon: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "points()",
    parameters: { columnLat, columnLon, newColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const expression =
        `ST_Point("${columnLon}", "${columnLat}")::GEOMETRY('EPSG:4326')`;
      return Object.keys(types).includes(newColumn)
        ? `SELECT * REPLACE (${expression} AS "${newColumn}") FROM ${input}`
        : `SELECT *, ${expression} AS "${newColumn}" FROM ${input}`;
    },
  });
}
