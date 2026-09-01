import quoteIdentifier from "../helpers/quoteIdentifier.ts";
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
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "outliersIQR()",
    parameters: { column, newColumn, options },
    needsSchema: false,
    buildSelect: (input) =>
      outliersIQRSelect(input, column, newColumn, options),
  });
}

function outliersIQRSelect(
  input: string,
  column: string,
  newColumn: string,
  options: {
    by?: string | string[];
  } = {},
) {
  const by = options.by
    ? stringToArray(options.by).map((d) => `${quoteIdentifier(d)}`)
    : [];

  const partition = by.length > 0 ? `PARTITION BY ${by.join(", ")}` : "";
  const quantile = (fraction: number) =>
    `IF(COUNT(*) OVER (${partition}) % 2 = 0,
      quantile_disc(${
      quoteIdentifier(column)
    }, ${fraction}) OVER (${partition}),
      quantile_cont(${quoteIdentifier(column)}, ${fraction}) OVER (${partition})
    )`;

  // q1/q3 are computed as window values (one pass) instead of a per-category
  // CTE joined back through a correlated subquery per row.
  return `SELECT * EXCLUDE ("_sda_q1", "_sda_q3"), CASE
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
            ${quantile(0.25)} AS "_sda_q1",
            ${quantile(0.75)} AS "_sda_q3"
        FROM ${input}
    ) "_sda"`;
}
