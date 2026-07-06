import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function unnestGeo(
  simpleTable: SimpleTable,
  column?: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "unnestGeo()",
    parameters: { column },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const col = column ?? findGeoColumnFromSchema(types);
      // The recursive UNNEST adds a path column, removed by the outer SELECT.
      return `SELECT * EXCLUDE(path) FROM (SELECT * EXCLUDE("${col}"), UNNEST(ST_Dump("${col}"), recursive := TRUE) FROM ${input})`;
    },
  });
}
