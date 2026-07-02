import mergeOptions from "../helpers/mergeOptions.ts";
import parseType from "../helpers/parseTypes.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function addColumn(
  simpleTable: SimpleTable,
  newColumn: string,
  type:
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
    | `GEOMETRY('${string}')`,
  definition: string,
) {
  const newType = parseType(type);

  let spatial = "";
  if (newType.toLowerCase().includes("geometry")) {
    spatial = "INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;";
  }

  await queryDB(
    simpleTable,
    `${spatial} ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" ${newType};
        UPDATE "${simpleTable.name}" SET "${newColumn}" = ${definition}`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "addColumn()",
      parameters: { newColumn, type, definition },
    }),
  );
}
