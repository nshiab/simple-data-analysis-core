import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import parseType from "../helpers/parseTypes.ts";
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

  queueOp(simpleTable, {
    kind: "fusable",
    method: "addColumn()",
    parameters: { newColumn, type, definition },
    // The schema is needed to reject a duplicate column, as v1's ALTER TABLE
    // ADD did.
    needsSchema: true,
    // A geometry column needs the spatial extension, both to cast to the
    // GEOMETRY type and for the spatial functions in the definition.
    needsSpatial: newType.toLowerCase().includes("geometry"),
    rawSQL: [definition],
    buildSelect: (input, types) => {
      assertNewColumns(types, [newColumn], "addColumn()");
      return `SELECT *, CAST((${definition}) AS ${newType}) AS ${
        quoteIdentifier(newColumn)
      } FROM ${input}`;
    },
  });
}
