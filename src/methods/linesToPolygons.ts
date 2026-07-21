import quoteIdentifier from "../helpers/quoteIdentifier.ts";
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
      return `SELECT * EXCLUDE(${quoteIdentifier(col)}), ST_MakePolygon(${
        quoteIdentifier(col)
      }) as ${quoteIdentifier(col)} FROM ${input}`;
    },
  });
}
