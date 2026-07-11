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
  // The offset is based on rowid, which only exists on the materialized
  // table, not on the output of a fused step: it executes as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "cloneColumnWithOffset()",
    parameters: { column, newColumn, options },
    execute: async () => {
      const offset = options.offset ?? 1;
      const categories = options.categories
        ? stringToArray(options.categories)
        : [];
      const partition = categories.length > 0
        ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
        : "";

      // When categories are specified, also sort the final result by
      // categories.
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT *, LEAD("${column}", ${offset}) OVER(${partition} ORDER BY rowid) AS "${newColumn}" FROM "${simpleTable.name}"${
          categories.length > 0
            ? ` ORDER BY ${categories.map((d) => `"${d}"`).join(", ")}, rowid`
            : ` ORDER BY rowid`
        };`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "cloneColumnWithOffset()",
          parameters: { column, newColumn },
        }),
      );
    },
  });
}
