import getCombinations from "../helpers/getCombinations.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

export default function correlations(
  simpleTable: SimpleTable,
  options: {
    x?: string;
    y?: string;
    categories?: string | string[];
    decimals?: number;
    outputTable?: string | boolean;
  } = {},
): SimpleTable {
  if (options.outputTable === true) {
    options.outputTable = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
  }

  if (typeof options.outputTable === "string") {
    // The output table instance is created at call time so it can be
    // returned synchronously and chained on right away.
    const outputTable = simpleTable.sdb.newTable(options.outputTable);
    queueOp(outputTable, {
      kind: "barrier",
      method: "correlations()",
      parameters: { options },
      execute: async () => {
        const combinations = getCorrelationsCombinations(
          await simpleTable.getTypes(),
          options,
        );
        await queryDB(
          simpleTable,
          `CREATE OR REPLACE TABLE "${outputTable.name}" AS ${
            correlationsSelect(
              `"${simpleTable.name}"`,
              combinations,
              options,
            )
          }`,
          mergeOptions(simpleTable, {
            table: outputTable.name,
            method: "correlations()",
            parameters: {
              options,
              "combinations (computed)": combinations,
            },
          }),
        );
      },
    });
    return outputTable;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "correlations()",
    parameters: { options },
    needsSchema: true,
    buildSelect: (input, types) =>
      correlationsSelect(
        input,
        getCorrelationsCombinations(types, options),
        options,
      ),
  });
  return simpleTable;
}

function getCorrelationsCombinations(
  types: TableSchema,
  options: { x?: string; y?: string },
): [string, string][] {
  let combinations: [string, string][] = [];
  if (!options.x && !options.y) {
    const columns = keepNumericalColumns(types);
    combinations = getCombinations(columns, 2);
  } else if (options.x && !options.y) {
    const columns = keepNumericalColumns(types);
    combinations = [];
    for (const col of columns) {
      if (col !== options.x) {
        combinations.push([options.x, col]);
      }
    }
  } else if (options.x && options.y) {
    combinations = [[options.x, options.y]];
  } else {
    throw new Error("No combinations of x and y");
  }
  return combinations;
}

function correlationsSelect(
  input: string,
  combinations: [string, string][],
  options: {
    categories?: string | string[];
    decimals?: number;
  },
) {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];

  const groupBy = categories.length === 0
    ? ""
    : ` GROUP BY ${categories.map((d) => `"${d}"`).join(",")}`;

  let query = ``;

  let firstValue = true;
  for (const comb of combinations) {
    if (firstValue) {
      firstValue = false;
    } else {
      query += "\nUNION";
    }
    const tempQuery = typeof options.decimals === "number"
      ? `ROUND(corr("${comb[0]}", "${comb[1]}"), ${options.decimals})`
      : `corr("${comb[0]}", "${comb[1]}")`;
    query += `\nSELECT ${
      categories.length > 0
        ? `${categories.map((d) => `"${d}"`).join(",")}, `
        : ""
    }'${comb[0]}' AS x, '${
      comb[1]
    }' AS y, ${tempQuery}  as "corr" FROM ${input}${groupBy}`;
  }

  return query;
}
