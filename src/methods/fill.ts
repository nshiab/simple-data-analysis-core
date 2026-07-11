import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function fill(
  simpleTable: SimpleTable,
  columns: string | string[],
  options: {
    categories?: string | string[];
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
    categories?: string | string[];
    interpolate?: boolean;
    interpolateBy?: string;
  },
): Promise<void> {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];

  const cols = stringToArray(columns);
  const excludeList = cols.map((col) => `"${col}"`).join(", ");
  let selectList: string;

  if (options.interpolate || options.interpolateBy) {
    // Use interpolateBy for the window function's ORDER BY (correct
    // interpolation math), but always order the final output by rowid to
    // preserve input row order.
    const windowOrder = options.interpolateBy
      ? `"${options.interpolateBy}"`
      : "rowid";
    const overClause = categories.length > 0
      ? `(PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")})`
      : `()`;
    selectList = cols
      .map(
        (col) =>
          `fill("${col}" ORDER BY ${windowOrder}) OVER ${overClause} as "${col}"`,
      )
      .join(", ");
  } else if (categories.length > 0) {
    const partition = `PARTITION BY ${
      categories.map((d) => `"${d}"`).join(", ")
    }`;
    selectList = cols
      .map(
        (col) =>
          `COALESCE("${col}", LAG("${col}" IGNORE NULLS) OVER(${partition} ORDER BY rowid)) as "${col}"`,
      )
      .join(", ");
  } else {
    selectList = cols
      .map(
        (col) =>
          `COALESCE("${col}", LAG("${col}" IGNORE NULLS) OVER(ORDER BY rowid)) as "${col}"`,
      )
      .join(", ");
  }

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE(${excludeList}), ${selectList} FROM "${simpleTable.name}" ORDER BY rowid;`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "fill()",
      parameters: { columns, ...options },
    }),
  );
}
