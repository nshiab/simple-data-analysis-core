import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import ensureSpatial from "../helpers/ensureSpatial.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import parseType from "../helpers/parseTypes.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function setTypes(
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
  // Creating a table from scratch (possibly with the spatial extension) is
  // multi-statement by nature: it executes as a barrier.
  types = structuredClone(types);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "setTypes()",
    parameters: { types },
    execute: async () => {
      if (
        Object.values(types)
          .map((d) => d.toLowerCase())
          .some((d) => d.startsWith("geometry"))
      ) {
        await ensureSpatial(simpleTable);
      }
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE ${quoteIdentifier(simpleTable.name)} (${
          Object.keys(
            types,
          )
            .map((d) => `${quoteIdentifier(d)} ${parseType(types[d])}`)
            .join(", ")
        });`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "setTypes()",
          parameters: { types },
        }),
      );
    },
  });
}
