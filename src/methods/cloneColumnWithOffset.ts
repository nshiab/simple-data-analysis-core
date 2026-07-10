import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function cloneColumnWithOffset(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    offset?: number;
    categories?: string | string[];
  } = {},
) {
  // The offset is based on a rowid-ordered row number, which only exists on
  // the materialized table, not on the output of a fused step: it executes
  // as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "cloneColumnWithOffset()",
    parameters: { column, newColumn, options },
    execute: () =>
      executeCloneColumnWithOffset(
        simpleTable,
        column,
        newColumn,
        options,
      ),
  });
}

async function executeCloneColumnWithOffset(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    offset?: number;
    categories?: string | string[];
  },
): Promise<void> {
  const offset = options.offset ?? 1;
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  const partition = categories.length > 0
    ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
    : "";

  // The temporary row number is created directly (not with the sync
  // addRowNumber builder, which would queue for the next flush).
  const tempRowCol = `rowNumberForCloneColumnWithOffset`;
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT *, (ROW_NUMBER() OVER(ORDER BY rowid) - 1) AS "${tempRowCol}" FROM "${simpleTable.name}" ORDER BY rowid`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "cloneColumnWithOffset()",
      parameters: { column, newColumn },
    }),
  );

  // Apply the offset using the row number for ordering
  // When categories are specified, also sort the final result by categories
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE("${tempRowCol}"), LEAD("${column}", ${offset}) OVER(${partition} ORDER BY "${tempRowCol}") AS "${newColumn}" FROM "${simpleTable.name}"${
      categories.length > 0
        ? ` ORDER BY ${
          categories.map((d) => `"${d}"`).join(", ")
        }, "${tempRowCol}"`
        : ` ORDER BY "${tempRowCol}"`
    };`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "cloneColumnWithOffset()",
      parameters: { column, newColumn },
    }),
  );
}
