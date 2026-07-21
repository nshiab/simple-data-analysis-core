import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function nbVertices(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  options = { ...options };
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
      return `SELECT *, CAST(ST_NPoints(${
        quoteIdentifier(column)
      }) AS BIGINT) AS ${quoteIdentifier(newColumn)} FROM ${input}`;
    },
  });
}
