import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function intersection(
  simpleTable: SimpleTable,
  column1: string,
  column2: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "intersection()",
    parameters: { column1, column2, newColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      // The schema type carries the projection (e.g. GEOMETRY('EPSG:4326')),
      // so the cast keeps it on the new geometries.
      const expression = `ST_Intersection(${quoteIdentifier(column1)}, ${
        quoteIdentifier(column2)
      })::${types[column1]}`;
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
