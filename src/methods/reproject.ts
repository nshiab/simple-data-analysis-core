import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import findGeoColumnFromSchema from "../helpers/findGeoColumnFromSchema.ts";
import parseValue from "../helpers/parseValue.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function reproject(
  simpleTable: SimpleTable,
  crs: string,
  options: { column?: string } = {},
) {
  const targetGeoType = `GEOMETRY${
    crs !== "null" ? `(${parseValue(crs)})` : ""
  }`;

  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "reproject()",
    parameters: { crs, options },
    needsSchema: true,
    needsSpatial: true,
    buildSelect: (input, types) => {
      const column = typeof options.column === "string"
        ? options.column
        : findGeoColumnFromSchema(types, "reproject()", simpleTable.name);
      return `SELECT * REPLACE (ST_Transform(${quoteIdentifier(column)}, ${
        parseValue(crs)
      })::${targetGeoType} AS ${quoteIdentifier(column)}) FROM ${input}`;
    },
  });
}
