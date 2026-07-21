import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import stringToArray from "../helpers/stringToArray.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function accumulate(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  // The accumulation order is based on rowid, which only exists on the
  // materialized table, not on the output of a fused step: it executes as a
  // barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "accumulate()",
    parameters: { column, newColumn, options },
    execute: async () => {
      // A SELECT *, expr AS col colliding with an existing column would be
      // silently renamed by DuckDB (col -> col_1) instead of erroring.
      assertNewColumns(
        await simpleTable.getTypes(),
        [newColumn],
        "accumulate()",
      );

      await queryDB(
        simpleTable,
        accumulateQuery(simpleTable.name, column, newColumn, options),
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "accumulate()",
          parameters: { column, newColumn, options },
        }),
      );
    },
  });
}

function accumulateQuery(
  table: string,
  column: string,
  newColumn: string,
  options: {
    categories?: string | string[];
  } = {},
) {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  const partition = categories.length > 0
    ? `PARTITION BY ${
      categories.map((d) => `${quoteIdentifier(d)}`).join(", ")
    } `
    : "";

  const query = `CREATE OR REPLACE TABLE ${
    quoteIdentifier(table)
  } AS SELECT *, SUM(${
    quoteIdentifier(column)
  }) OVER (${partition}ORDER BY rowid) AS ${quoteIdentifier(newColumn)}
    FROM ${quoteIdentifier(table)}
    ORDER BY rowid;`;

  return query;
}
