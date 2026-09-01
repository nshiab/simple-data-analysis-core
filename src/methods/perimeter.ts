import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function perimeter(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { unit?: "m" | "km"; column?: string; decimals?: number } = {},
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
        : findGeoColumnFromSchema(types, "perimeter()", simpleTable.name);
      let expression = `ST_Perimeter_Spheroid(${quoteIdentifier(column)}) ${
        options.unit === "km" ? "/ 1000" : ""
      }`;
      if (typeof options.decimals === "number") {
        expression = `ROUND(${expression}, ${options.decimals})`;
      }
      return `SELECT *, CAST(${expression} AS DOUBLE) AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}
