import assertNewColumns from "../helpers/assertNewColumns.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function nbVertices(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "nbVertices()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "nbVertices()");
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      return `SELECT *, CAST(ST_NPoints("${column}") AS BIGINT) AS "${newColumn}" FROM ${input}`;
    },
  });
}
