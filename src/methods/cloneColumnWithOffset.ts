import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function cloneColumnWithOffset(
  simpleTable: SimpleTable,
  originalColumn: string,
  newColumn: string,
  options: {
    offset?: number;
    categories?: string | string[];
  } = {},
) {
  const offset = options.offset ?? 1;
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  const partition = categories.length > 0
    ? `PARTITION BY ${categories.map((d) => `"${d}"`).join(", ")}`
    : "";

  const tempRowCol = `rowNumberForCloneColumnWithOffset`;
  await simpleTable.addRowNumber(tempRowCol);

  // Apply the offset using the row number for ordering
  // When categories are specified, also sort the final result by categories
  await queryDB(
    simpleTable,
    `CREATE OR REPLACE TABLE "${simpleTable.name}" AS SELECT * EXCLUDE("${tempRowCol}"), LEAD("${originalColumn}", ${offset}) OVER(${partition} ORDER BY "${tempRowCol}") AS "${newColumn}" FROM "${simpleTable.name}"${
      categories.length > 0
        ? ` ORDER BY ${
          categories.map((d) => `"${d}"`).join(", ")
        }, "${tempRowCol}"`
        : ` ORDER BY "${tempRowCol}"`
    };`,
    mergeOptions(simpleTable, {
      table: simpleTable.name,
      method: "cloneColumnWithOffset()",
      parameters: { originalColumn, newColumn },
    }),
  );
}
