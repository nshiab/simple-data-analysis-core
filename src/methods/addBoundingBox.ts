import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function addBoundingBox(
  simpleTable: SimpleTable,
  options: {
    column?: string;
    decimals?: number;
  } = {},
) {
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "addBoundingBox()",
    parameters: { options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = options.column ??
        findGeoColumnFromSchema(types, "addBoundingBox()", simpleTable.name);
      const round = (expression: string) =>
        typeof options.decimals === "number"
          ? `ROUND(${expression}, ${options.decimals})`
          : expression;
      return `SELECT *,
    ${round(`ST_XMin(${quoteIdentifier(column)})`)} AS minLon,
    ${round(`ST_YMin(${quoteIdentifier(column)})`)} AS minLat,
    ${round(`ST_XMax(${quoteIdentifier(column)})`)} AS maxLon,
    ${round(`ST_YMax(${quoteIdentifier(column)})`)} AS maxLat
    FROM ${input}`;
    },
  });
}
