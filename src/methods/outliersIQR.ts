import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function outliersIQR(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    by?: string | string[];
  } = {},
) {
  // The quantile function depends on the parity of the number of rows, so
  // outliersIQR can't be expressed as a single SELECT over its input: it
  // executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "outliersIQR()",
    parameters: { column, newColumn, options },
    execute: async () => {
      await queryDB(
        simpleTable,
        outliersIQRQuery(
          simpleTable.name,
          column,
          newColumn,
          (await simpleTable.getRowCount()) % 2 === 0 ? "even" : "odd",
          options,
        ),
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "outliersIQR()",
          parameters: { column, newColumn, options },
        }),
      );
    },
  });
}

function outliersIQRQuery(
  table: string,
  column: string,
  newColumn: string,
  parity: "even" | "odd",
  options: {
    by?: string | string[];
  } = {},
) {
  const by = options.by
    ? stringToArray(options.by).map((d) => `${quoteIdentifier(d)}`)
    : [];

  const quantileFunc = parity === "even" ? "quantile_disc" : "quantile_cont";
  const partition = by.length > 0 ? `PARTITION BY ${by.join(", ")}` : "";

  // q1/q3 are computed as window values (one pass) instead of a per-category
  // CTE joined back through a correlated subquery per row.
  return `CREATE OR REPLACE TABLE ${quoteIdentifier(table)} AS
    SELECT * EXCLUDE ("_sda_q1", "_sda_q3"), CASE
        WHEN ${
    quoteIdentifier(column)
  } > "_sda_q3" + ("_sda_q3" - "_sda_q1") * 1.5
          OR ${
    quoteIdentifier(column)
  } < "_sda_q1" - ("_sda_q3" - "_sda_q1") * 1.5
        THEN TRUE
        ELSE FALSE
    END AS ${quoteIdentifier(newColumn)}
    FROM (
        SELECT *,
            ${quantileFunc}(${
    quoteIdentifier(column)
  }, 0.25) OVER (${partition}) AS "_sda_q1",
            ${quantileFunc}(${
    quoteIdentifier(column)
  }, 0.75) OVER (${partition}) AS "_sda_q3"
        FROM ${quoteIdentifier(table)}
    ) "_sda"`;
}
