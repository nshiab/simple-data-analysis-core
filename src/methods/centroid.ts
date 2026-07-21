import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function centroid(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "centroid()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      // The schema type carries the projection (e.g. GEOMETRY('EPSG:4326')),
      // so the cast keeps it on the new geometries.
      const expression = `ST_Centroid(${quoteIdentifier(column)})::${
        types[column]
      }`;
      return Object.keys(types).includes(newColumn)
        ? `SELECT * REPLACE (${expression} AS ${
          quoteIdentifier(newColumn)
        }) FROM ${input}`
        : `SELECT *, ${expression} AS ${
          quoteIdentifier(newColumn)
        } FROM ${input}`;
    },
  });
}
