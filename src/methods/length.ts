import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function length(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { unit?: "m" | "km"; column?: string } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "length()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      return `SELECT *, CAST(ST_Length_Spheroid("${column}") ${
        options.unit === "km" ? "/ 1000" : ""
      } AS DOUBLE) AS "${newColumn}" FROM ${input}`;
    },
  });
}
