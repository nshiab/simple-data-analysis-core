import mergeOptions from "../helpers/mergeOptions.ts";
import parseType from "../helpers/parseTypes.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function setTypes(
  simpleTable: SimpleTable,
  types: {
    [key: string]:
      | "integer"
      | "float"
      | "number"
      | "string"
      | "date"
      | "time"
      | "datetime"
      | "datetimeTz"
      | "bigint"
      | "double"
      | "varchar"
      | "timestamp"
      | "timestamp with time zone"
      | "boolean"
      | `geometry('${string}')`
      | `GEOMETRY('${string}')`;
  },
) {
  let spatial = "";
  if (
    Object.values(types)
      .map((d) => d.toLowerCase())
      .some((d) => d.startsWith("geometry"))
  ) {
    spatial = "INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;\n";
  }
  await queryDB(
    simpleTable,
    `${spatial}CREATE OR REPLACE TABLE "${simpleTable.name}" (${
      Object.keys(
        types,
      )
        .map((d) => `"${d}" ${parseType(types[d])}`)
        .join(", ")
    });`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "setTypes()",
      parameters: { types },
    }),
  );
}
