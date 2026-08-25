import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import parseValue from "../helpers/parseValue.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function createPoints(
  simpleTable: SimpleTable,
  latColumn: string,
  lonColumn: string,
  newColumn: string,
  options: { projection?: string } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "createPoints()",
    parameters: { latColumn, lonColumn, newColumn, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const expression = `ST_Point(${quoteIdentifier(lonColumn)}, ${
        quoteIdentifier(latColumn)
      })::GEOMETRY(${parseValue(options.projection ?? "EPSG:4326")})`;
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
