import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function fill(
  simpleTable: SimpleTable,
  columns: string | string[],
  options: {
    categories?: string | string[];
    interpolate?: boolean;
    interpolateBy?: string;
  } = {},
) {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  const tempRowCol = `rowNumberForFill`;

  if (options.interpolateBy && options.interpolate === false) {
    throw new Error(
      `interpolate cannot be false when interpolateBy is set.`,
    );
  }

  if (options.interpolate || options.interpolateBy) {
    const cols = stringToArray(columns);

    // Always add temp row number to preserve original row order in output
    await simpleTable.addRowNumber(tempRowCol);

    // Use interpolateBy for the window function's ORDER BY (correct interpolation math),
    // but always order final output by tempRowCol to preserve input row order
    const windowOrderCol = options.interpolateBy ?? tempRowCol;
    const excludeList = [`"${tempRowCol}"`, ...cols].join(", ");
    const overClause = categories.length > 0
      ? `(PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")})`
      : `()`;
    const selectList = cols
      .map(
        (col) =>
          `fill(${col} ORDER BY "${windowOrderCol}") OVER ${overClause} as ${col}`,
      )
      .join(", ");
    await queryDB(
      simpleTable,
      `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE(${excludeList}), ${selectList} FROM "${simpleTable.name}" ORDER BY "${tempRowCol}";`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "fill()",
        parameters: { columns, ...options },
      }),
    );
  } else if (categories.length > 0) {
    const partition = `PARTITION BY ${
      categories.map((d) => `"${d}"`).join(", ")
    }`;
    await simpleTable.addRowNumber(tempRowCol);
    const cols = stringToArray(columns);
    const excludeList = [`"${tempRowCol}"`, ...cols].join(", ");
    const selectList = cols
      .map(
        (col) =>
          `COALESCE(${col}, LAG(${col} IGNORE NULLS) OVER(${partition} ORDER BY "${tempRowCol}")) as ${col}`,
      )
      .join(", ");
    await queryDB(
      simpleTable,
      `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE(${excludeList}), ${selectList} FROM "${simpleTable.name}" ORDER BY "${tempRowCol}";`,
      mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "fill()",
        parameters: { columns, ...options },
      }),
    );
  } else {
    // Simple path: add temp row number and order by it to preserve input row order
    await simpleTable.addRowNumber(tempRowCol);
    const cols = stringToArray(columns);
    const excludeList = [`"${tempRowCol}"`, ...cols].join(", ");
    const selectList = cols
      .map(
        (col) => `COALESCE(${col}, LAG(${col} IGNORE NULLS) OVER()) as ${col}`,
      )
      .join(", ");
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
}
