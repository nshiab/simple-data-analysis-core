import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function addRowNumber(
  simpleTable: SimpleTable,
  newColumn: string,
  options: { categories?: string | string[] } = {},
) {
  // The row number is based on rowid, which only exists on the materialized
  // table, not on the output of a fused step: it executes as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "addRowNumber()",
    parameters: { newColumn, options },
    execute: async () => {
      const categories = options.categories
        ? stringToArray(options.categories)
        : [];
      const partition = categories.length > 0
        ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
        : "";

      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT *, (ROW_NUMBER() OVER(${partition} ORDER BY rowid) - 1) AS "${newColumn}" FROM "${simpleTable.name}" ORDER BY rowid`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "addRowNumber()",
          parameters: { newColumn, options },
        }),
      );
    },
  });
}
