import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function linesToPolygons(
  simpleTable: SimpleTable,
  column?: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "linesToPolygons()",
    parameters: { column },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const col = column ?? findGeoColumnFromSchema(types);
      return `SELECT * EXCLUDE("${col}"), ST_MakePolygon("${col}") as "${col}" FROM ${input}`;
    },
  });
}
