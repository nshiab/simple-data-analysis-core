import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function perimeter(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { unit?: "m" | "km"; column?: string } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "perimeter()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "perimeter()");
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types);
      return `SELECT *, CAST(ST_Perimeter_Spheroid(${
        quoteIdentifier(column)
      }) ${options.unit === "km" ? "/ 1000" : ""} AS DOUBLE) AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}
