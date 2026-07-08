import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function flipCoordinates(
  simpleTable: SimpleTable,
  column?: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "flipCoordinates()",
    parameters: { column },
    needsSchema: true,
    needsSpatial: true,
    // The cast pins the geometry column back to its existing type, so the
    // schema is unchanged.
    preservesSchema: true,
    buildSelect: (input, types) => {
      const col = column ?? findGeoColumnFromSchema(types);
      // The schema type carries the projection (e.g. GEOMETRY('EPSG:4326')),
      // so the cast keeps it on the new geometries.
      return `SELECT * REPLACE (ST_FlipCoordinates("${col}")::${
        types[col]
      } AS "${col}") FROM ${input}`;
    },
  });
}
