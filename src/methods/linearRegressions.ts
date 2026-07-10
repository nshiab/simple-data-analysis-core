import getCombinations from "../helpers/getCombinations.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

export default function linearRegressions(
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
      method: "linearRegressions()",
      parameters: { options },
      execute: async () => {
        const permutations = getLinearRegressionsPermutations(
          await simpleTable.getTypes(),
          options,
        );
        await queryDB(
          simpleTable,
          `CREATE OR REPLACE TABLE "${outputTable.name}" AS ${
            linearRegressionsSelect(
              `"${simpleTable.name}"`,
              permutations,
              options,
            )
          }`,
          mergeOptions(simpleTable, {
            table: outputTable.name,
            method: "linearRegressions()",
            parameters: {
              options,
              "permutations (computed)": permutations,
            },
          }),
        );
      },
    });
    return outputTable;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "linearRegressions()",
    parameters: { options },
    needsSchema: true,
    buildSelect: (input, types) =>
      linearRegressionsSelect(
        input,
        getLinearRegressionsPermutations(types, options),
        options,
      ),
  });
  return simpleTable;
}

function getLinearRegressionsPermutations(
  types: TableSchema,
  options: { x?: string; y?: string },
): [string, string][] {
  const permutations: [string, string][] = [];
  if (!options.x && !options.y) {
    const columns = keepNumericalColumns(types);
    const combinations = getCombinations(columns, 2);
    for (const c of combinations) {
      permutations.push(c);
      permutations.push([c[1], c[0]]);
    }
  } else if (options.x && !options.y) {
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
  return permutations;
}

function linearRegressionsSelect(
  input: string,
  permutations: [string, string][],
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

  const catSelect = categories.length > 0
    ? `${categories.map((d) => `"${d}"`).join(",")}, `
    : "";

  // One UNION ALL branch per permutation (each with a distinct pair of
  // literals, so deduplication would never remove anything). DuckDB runs the
  // branches as concurrent pipelines, which parallelizes the aggregates
  // better than computing them all in one scan.
  const branches = permutations.map((perm) => {
    const expressions = [
      ["slope", "REGR_SLOPE"],
      ["yIntercept", "REGR_INTERCEPT"],
      ["r2", "REGR_R2"],
    ].map(([alias, fn]) => {
      const expression = typeof options.decimals === "number"
        ? `ROUND(${fn}("${perm[1]}", "${perm[0]}"), ${options.decimals})`
        : `${fn}("${perm[1]}", "${perm[0]}")`;
      return `${expression} AS "${alias}"`;
    });
    return `SELECT ${catSelect}'${perm[0]}' AS "x", '${perm[1]}' AS "y", ${
      expressions.join(", ")
    }
        FROM ${input}${groupBy}`;
  });

  return branches.join("\nUNION ALL\n");
}
