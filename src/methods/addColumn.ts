import mergeOptions from "../helpers/mergeOptions.ts";
import queueOp from "../helpers/queueOp.ts";
import parseType from "../helpers/parseTypes.ts";
import queryDB from "../helpers/queryDB.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function addColumn(
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

  if (newType.toLowerCase().includes("geometry")) {
    // Loading the spatial extension makes this multi-statement by nature.
    queueOp(simpleTable, {
      kind: "barrier",
      method: "addColumn()",
      parameters: { newColumn, type, definition },
      execute: async () => {
        await queryDB(
          simpleTable,
          `INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;
        ALTER TABLE "${simpleTable.name}" ADD "${newColumn}" ${newType};
        UPDATE "${simpleTable.name}" SET "${newColumn}" = ${definition}`,
          mergeOptions(simpleTable, {
            table: simpleTable.name,
            method: "addColumn()",
            parameters: { newColumn, type, definition },
          }),
        );
      },
    });
    return;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "addColumn()",
    parameters: { newColumn, type, definition },
    needsSchema: false,
    buildSelect: (input) =>
      `SELECT *, CAST((${definition}) AS ${newType}) AS "${newColumn}" FROM ${input}`,
  });
}
