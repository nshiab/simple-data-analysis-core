import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function area(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { unit?: "m2" | "km2"; column?: string; decimals?: number } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "area()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "area()");
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types, "area()", simpleTable.name);
      let expression = `ST_Area_Spheroid(${quoteIdentifier(column)}) ${
        options.unit === "km2" ? "/ 1000000" : ""
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
