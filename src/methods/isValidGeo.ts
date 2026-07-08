import assertNewColumns from "../helpers/assertNewColumns.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function isValidGeo(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "isValidGeo()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "isValidGeo()");
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      return `SELECT *, CAST(ST_IsValid("${column}") AS BOOLEAN) AS "${newColumn}" FROM ${input}`;
    },
  });
}
