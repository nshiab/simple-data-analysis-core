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

  // The fill order is based on a rowid-based row number, which only exists
  // on the materialized table: it executes as a barrier.
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
  const tempRowCol = `rowNumberForFill`;

  // The temporary row number is created directly (not with the sync
  // addRowNumber builder, which would queue for the next flush).
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT *, (ROW_NUMBER() OVER(ORDER BY rowid) - 1) AS "${tempRowCol}" FROM "${simpleTable.name}" ORDER BY rowid`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "fill()",
      parameters: { columns, ...options },
    }),
  );

  const cols = stringToArray(columns);
  const excludeList = [`"${tempRowCol}"`, ...cols].join(", ");
  let selectList: string;

  if (options.interpolate || options.interpolateBy) {
    // Use interpolateBy for the window function's ORDER BY (correct interpolation math),
    // but always order final output by tempRowCol to preserve input row order
    const windowOrderCol = options.interpolateBy ?? tempRowCol;
    const overClause = categories.length > 0
      ? `(PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")})`
      : `()`;
    selectList = cols
      .map(
        (col) =>
          `fill(${col} ORDER BY "${windowOrderCol}") OVER ${overClause} as ${col}`,
      )
      .join(", ");
  } else if (categories.length > 0) {
    const partition = `PARTITION BY ${
      categories.map((d) => `"${d}"`).join(", ")
    }`;
    selectList = cols
      .map(
        (col) =>
          `COALESCE(${col}, LAG(${col} IGNORE NULLS) OVER(${partition} ORDER BY "${tempRowCol}")) as ${col}`,
      )
      .join(", ");
  } else {
    selectList = cols
      .map(
        (col) => `COALESCE(${col}, LAG(${col} IGNORE NULLS) OVER()) as ${col}`,
      )
      .join(", ");
  }

  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE(${excludeList}), ${selectList} FROM "${simpleTable.name}" ORDER BY "${tempRowCol}";`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "fill()",
      parameters: { columns, ...options },
    }),
  );
}
