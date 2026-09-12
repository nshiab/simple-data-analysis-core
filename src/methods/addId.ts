import assertNewColumns from "../helpers/assertNewColumns.ts";
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

  // IDs follow the materialized row order. rowid is unavailable on the output
  // of a fused step, so this operation executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "addId()",
    parameters: { newColumn, options },
    execute: async () => {
      const types = await simpleTable.getTypes();
      // DuckDB identifiers are ASCII case-insensitive even when quoted.
      const foldIdentifier = (name: string) =>
        name.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
      const existingColumn = Object.keys(types).find((column) =>
        foldIdentifier(column) === foldIdentifier(newColumn)
      );
      assertNewColumns(
        types,
        [existingColumn ?? newColumn],
        "addId()",
      );

      const rowNumber = "(ROW_NUMBER() OVER(ORDER BY rowid) - 1)";
      const id = options.prefix === undefined
        ? rowNumber
        : `CONCAT(?, CAST(${rowNumber} AS VARCHAR))`;
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE ${
          quoteIdentifier(simpleTable.name)
        } AS SELECT *, ${id} AS ${quoteIdentifier(newColumn)} FROM ${
          quoteIdentifier(simpleTable.name)
        } ORDER BY rowid`,
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
