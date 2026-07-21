import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function points(
  simpleTable: SimpleTable,
  latColumn: string,
  lonColumn: string,
  newColumn: string,
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "points()",
    parameters: { latColumn, lonColumn, newColumn },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const expression = `ST_Point(${quoteIdentifier(lonColumn)}, ${
        quoteIdentifier(latColumn)
      })::GEOMETRY('EPSG:4326')`;
      return Object.keys(types).includes(newColumn)
        ? `SELECT * REPLACE (${expression} AS ${
          quoteIdentifier(newColumn)
        }) FROM ${input}`
        : `SELECT *, ${expression} AS ${
          quoteIdentifier(newColumn)
        } FROM ${input}`;
    },
  });
}
