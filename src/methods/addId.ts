import assertNewColumns from "../helpers/assertNewColumns.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function addId(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { prefix?: string } = {},
) {
  if (typeof newColumn !== "string") {
    throw new TypeError("addId() newColumn must be a string.");
  }
  if (options.prefix !== undefined && typeof options.prefix !== "string") {
    throw new TypeError("addId() options.prefix must be a string.");
  }

  // Materialize preceding operations so IDs follow their resulting row order.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "addId()",
    parameters: { newColumn, options },
    execute: async () => {
      const types = await simpleTable.getTypes();
      const existingColumn = Object.keys(types).find((column) =>
        foldIdentifier(column) === foldIdentifier(newColumn)
      );
      assertNewColumns(
        types,
        [existingColumn ?? newColumn],
        "addId()",
      );

      // An empty window preserves scan order without referencing rowid, which
      // may be shadowed by a user column.
      const rowNumber = "(ROW_NUMBER() OVER () - 1)";
      const id = options.prefix === undefined
        ? rowNumber
        : `CONCAT(?, CAST(${rowNumber} AS VARCHAR))`;
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE ${
          quoteIdentifier(simpleTable.name)
        } AS SELECT *, ${id} AS ${quoteIdentifier(newColumn)} FROM ${
          quoteIdentifier(simpleTable.name)
        }`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "addId()",
          parameters: { newColumn, options },
          values: options.prefix === undefined ? undefined : [options.prefix],
        }),
      );
    },
  });
}
