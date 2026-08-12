import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function fillHoles(
  simpleTable: SimpleTable,
  column?: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "fillHoles()",
    parameters: { column },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const col = column ??
        findGeoColumnFromSchema(types, "fillHoles()", simpleTable.name);
      // Like the previous UPDATE-based implementation, the result is always
      // stored in the "geom" column, and the assignment cast keeps its type.
      return `SELECT * REPLACE (ST_MakePolygon(ST_ExteriorRing(${
        quoteIdentifier(col)
      }))${types["geom"] ? `::${types["geom"]}` : ""} AS "geom") FROM ${input}`;
    },
  });
}
