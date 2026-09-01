import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function reducePrecision(
  simpleTable: SimpleTable,
  decimals: number,
  options: { column?: string } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "reducePrecision()",
    parameters: { decimals, options },
    needsSchema: true,
    needsSpatial: true,
    // The cast pins the geometry column back to its existing type, so the
    // schema is unchanged.
    preservesSchema: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types, "reducePrecision()", simpleTable.name);
      // The schema type carries the projection (e.g. GEOMETRY('EPSG:4326')),
      // so the cast keeps it on the new geometries.
      return `SELECT * REPLACE (ST_ReducePrecision(${
        quoteIdentifier(column)
      }, ${1 / Math.pow(10, decimals)})::${types[column]} AS ${
        quoteIdentifier(column)
      }) FROM ${input}`;
    },
  });
}
