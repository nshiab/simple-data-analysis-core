import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function extractLatLon(
  simpleTable: SimpleTable,
  column: string,
  latColumn: string,
  lonColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "extractLatLon()",
    parameters: { column, latColumn, lonColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      assertNewColumns(types, [latColumn, lonColumn], "extractLatLon()");
      return `SELECT *, CAST(ST_Y(${quoteIdentifier(column)}) AS DOUBLE) AS ${
        quoteIdentifier(latColumn)
      }, CAST(ST_X(${quoteIdentifier(column)}) AS DOUBLE) AS ${
        quoteIdentifier(lonColumn)
      } FROM ${input}`;
    },
  });
}
