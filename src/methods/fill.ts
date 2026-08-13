import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function fill(
  simpleTable: SimpleTable,
  columns: string | string[],
  options: {
    by?: string | string[];
    interpolate?: boolean;
    interpolateBy?: string;
  } = {},
) {
  // This validation doesn't need the database, so it stays at call time.
  if (options.interpolateBy && options.interpolate === false) {
    throw new Error(
      `interpolate cannot be false when interpolateBy is set.`,
    );
  }

  // The fill order is based on rowid, which only exists on the materialized
  // table: it executes as a barrier.
  columns = Array.isArray(columns) ? [...columns] : columns;
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "fill()",
    parameters: { columns, options },
    execute: () => executeFill(simpleTable, columns, options),
  });
}

async function executeFill(
  simpleTable: SimpleTable,
  columns: string | string[],
  options: {
    by?: string | string[];
    interpolate?: boolean;
    interpolateBy?: string;
  },
): Promise<void> {
  const by = options.by ? stringToArray(options.by) : [];

  const cols = stringToArray(columns);
  const excludeList = cols.map((col) => `${quoteIdentifier(col)}`).join(", ");
  let selectList: string;

  if (options.interpolate || options.interpolateBy) {
    // Use interpolateBy for the window function's ORDER BY (correct
    // interpolation math), but always order the final output by rowid to
    // preserve input row order.
    const windowOrder = options.interpolateBy
      ? `${quoteIdentifier(options.interpolateBy)}`
      : "rowid";
    const overClause = by.length > 0
      ? `(PARTITION BY ${by.map((d) => `${quoteIdentifier(d)}`).join(", ")})`
      : `()`;
    selectList = cols
      .map(
        (col) =>
          `fill(${
            quoteIdentifier(col)
          } ORDER BY ${windowOrder}) OVER ${overClause} as ${
            quoteIdentifier(col)
          }`,
      )
      .join(", ");
  } else if (by.length > 0) {
    const partition = `PARTITION BY ${
      by.map((d) => `${quoteIdentifier(d)}`).join(", ")
    }`;
    selectList = cols
      .map(
        (col) =>
          `COALESCE(${quoteIdentifier(col)}, LAG(${
            quoteIdentifier(col)
          } IGNORE NULLS) OVER(${partition} ORDER BY rowid)) as ${
            quoteIdentifier(col)
          }`,
      )
      .join(", ");
  } else {
    selectList = cols
      .map(
        (col) =>
          `COALESCE(${quoteIdentifier(col)}, LAG(${
            quoteIdentifier(col)
          } IGNORE NULLS) OVER(ORDER BY rowid)) as ${quoteIdentifier(col)}`,
      )
      .join(", ");
  }

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE ${
      quoteIdentifier(simpleTable.name)
    } AS SELECT * EXCLUDE(${excludeList}), ${selectList} FROM ${
      quoteIdentifier(simpleTable.name)
    } ORDER BY rowid;`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "fill()",
      parameters: { columns, ...options },
    }),
  );
}
