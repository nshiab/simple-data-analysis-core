import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function boundingBox(
  simpleTable: SimpleTable,
  options: {
    column?: string;
    decimals?: number;
  } = {},
) {
  queueOp(simpleTable, {
    kind: "fusable",
    method: "boundingBox()",
    parameters: { options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = options.column ?? findGeoColumnFromSchema(types);
      const round = (expression: string) =>
        typeof options.decimals === "number"
          ? `ROUND(${expression}, ${options.decimals})`
          : expression;
      return `SELECT *,
    ${round(`ST_XMin("${column}")`)} AS minLon,
    ${round(`ST_YMin("${column}")`)} AS minLat,
    ${round(`ST_XMax("${column}")`)} AS maxLon,
    ${round(`ST_YMax("${column}")`)} AS maxLat
    FROM ${input}`;
    },
  });
}
