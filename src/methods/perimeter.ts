import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function perimeter(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { unit?: "m" | "km"; column?: string } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "perimeter()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      return `SELECT *, CAST(ST_Perimeter_Spheroid("${column}") ${
        options.unit === "km" ? "/ 1000" : ""
      } AS DOUBLE) AS "${newColumn}" FROM ${input}`;
    },
  });
}
