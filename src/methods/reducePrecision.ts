import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function reducePrecision(
  simpleTable: SimpleTable,
  decimals: number,
  options: { column?: string } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "reducePrecision()",
    parameters: { decimals, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      // The schema type carries the projection (e.g. GEOMETRY('EPSG:4326')),
      // so the cast keeps it on the new geometries.
      return `SELECT * REPLACE (ST_ReducePrecision("${column}", ${
        1 / Math.pow(10, decimals)
      })::${types[column]} AS "${column}") FROM ${input}`;
    },
  });
}
