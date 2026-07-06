import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function isClosedGeo(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "isClosedGeo()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      return `SELECT *, CAST(ST_IsClosed("${column}") AS BOOLEAN) AS "${newColumn}" FROM ${input}`;
    },
  });
}
