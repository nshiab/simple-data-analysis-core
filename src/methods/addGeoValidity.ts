import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function addGeoValidity(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { column?: string } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "addGeoValidity()",
    parameters: { newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "addGeoValidity()");
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types, "addGeoValidity()", simpleTable.name);
      return `SELECT *, CAST(ST_IsValid(${
        quoteIdentifier(column)
      }) AS BOOLEAN) AS ${quoteIdentifier(newColumn)} FROM ${input}`;
    },
  });
}
