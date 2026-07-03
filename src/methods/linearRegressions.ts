import getCombinations from "../helpers/getCombinations.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default async function linearRegressions(
  SimpleTable: SimpleTable,
  options: {
    x?: string;
    y?: string;
    categories?: string | string[];
    decimals?: number;
    outputTable?: string | boolean;
  } = {},
) {
  const outputTable = typeof options.outputTable === "string"
    ? options.outputTable
    : SimpleTable.name;

  const permutations: [string, string][] = [];
  if (!options.x && !options.y) {
    const types = await SimpleTable.getTypes();
    const columns = keepNumericalColumns(types);
    const combinations = getCombinations(columns, 2);
    for (const c of combinations) {
      permutations.push(c);
      permutations.push([c[1], c[0]]);
    }
  } else if (options.x && !options.y) {
    const types = await SimpleTable.getTypes();
    const columns = keepNumericalColumns(types);
    for (const col of columns) {
      if (col !== options.x) {
        permutations.push([options.x, col]);
      }
    }
  } else if (options.x && options.y) {
    permutations.push([options.x, options.y]);
  } else {
    throw new Error("No combinations of x and y");
  }

  await queryDB(
    SimpleTable,
    linearRegressionQuery(
      SimpleTable.name,
      outputTable,
      permutations,
      options,
    ),
    mergeOptions(SimpleTable, {
      table: outputTable,
      method: "linearRegressions()",
      parameters: {
        options,
        "permutations (computed)": permutations,
      },
    }),
  );
}

function linearRegressionQuery(
  table: string,
  outputTable: string,
  permutations: [string, string][],
  options: {
    categories?: string | string[];
    decimals?: number;
  },
) {
  let query = `CREATE OR REPLACE TABLE "${outputTable}" AS`;

  const categories = options.categories
    ? stringToArray(options.categories)
    : [];

  const groupBy = categories.length === 0
    ? ""
    : ` GROUP BY ${categories.map((d) => `"${d}"`).join(",")}`;

  let firstValue = true;
  for (const perm of permutations) {
    if (firstValue) {
      firstValue = false;
    } else {
      query += "\nUNION";
    }

    let tempSlop;
    let tempIntercept;
    let tempR2;
    if (typeof options.decimals === "number") {
      tempSlop = `ROUND(REGR_SLOPE("${perm[1]}", "${
        perm[0]
      }"), ${options.decimals})`;
      tempIntercept = `ROUND(REGR_INTERCEPT("${perm[1]}", "${
        perm[0]
      }"), ${options.decimals})`;
      tempR2 = `ROUND(REGR_R2("${perm[1]}", "${
        perm[0]
      }"), ${options.decimals})`;
    } else {
      tempSlop = `REGR_SLOPE("${perm[1]}", "${perm[0]}")`;
      tempIntercept = `REGR_INTERCEPT("${perm[1]}", "${perm[0]}")`;
      tempR2 = `REGR_R2("${perm[1]}", "${perm[0]}")`;
    }

    query += `\nSELECT ${
      categories.length > 0
        ? `${categories.map((d) => `"${d}"`).join(",")}, `
        : ""
    }'${perm[0]}' AS "x", '${
      perm[1]
    }' AS "y", ${tempSlop} AS "slope", ${tempIntercept} AS "yIntercept", ${tempR2} as "r2"
        FROM "${table}"${groupBy}`;
  }

  return query;
}
