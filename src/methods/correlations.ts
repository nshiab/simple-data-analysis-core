import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import getCombinations from "../helpers/getCombinations.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import resolveOutputTable from "../helpers/resolveOutputTable.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import validateNumericalAnalysis from "../helpers/validateNumericalAnalysis.ts";

export default function correlations(
  simpleTable: SimpleTable,
  options: {
    x?: string;
    y?: string;
    by?: string | string[];
    decimals?: number;
    outputTable?: string | boolean;
  } = {},
): SimpleTable {
  options = structuredClone(options);
  options.outputTable = resolveOutputTable(simpleTable, options.outputTable);

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
          simpleTable.name,
        );
        await queryDB(
          simpleTable,
          `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable.name)} AS ${
            correlationsSelect(
              `${quoteIdentifier(simpleTable.name)}`,
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
            values: correlationsValues(combinations),
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
    values: (types) =>
      correlationsValues(
        getCorrelationsCombinations(types, options, simpleTable.name),
      ),
    buildSelect: (input, types) =>
      correlationsSelect(
        input,
        getCorrelationsCombinations(types, options, simpleTable.name),
        options,
      ),
  });
  return simpleTable;
}

function correlationsValues(
  combinations: [string, string][],
): string[] {
  return combinations.flatMap(([x, y]) => [x, y]);
}

function getCorrelationsCombinations(
  types: TableSchema,
  options: { x?: string; y?: string },
  tableName: string,
): [string, string][] {
  const columns = validateNumericalAnalysis(
    types,
    options,
    "correlations()",
    tableName,
  );
  let combinations: [string, string][] = [];
  if (options.x === undefined) {
    combinations = getCombinations(columns, 2);
  } else if (options.y === undefined) {
    combinations = [];
    for (const col of columns) {
      if (col !== options.x) {
        combinations.push([options.x, col]);
      }
    }
  } else {
    combinations = [[options.x, options.y]];
  }
  return combinations;
}

function correlationsSelect(
  input: string,
  combinations: [string, string][],
  options: {
    by?: string | string[];
    decimals?: number;
  },
) {
  const by = options.by ? stringToArray(options.by) : [];

  const groupBy = by.length === 0
    ? ""
    : ` GROUP BY ${by.map((d) => `${quoteIdentifier(d)}`).join(",")}`;

  const catSelect = by.length > 0
    ? `${by.map((d) => `${quoteIdentifier(d)}`).join(",")}, `
    : "";

  // One UNION ALL branch per pair (each with a distinct pair of literals, so
  // deduplication would never remove anything). DuckDB runs the branches as
  // concurrent pipelines, which parallelizes the aggregates better than
  // computing them all in one scan.
  const branches = combinations.map((comb) => {
    const expression = typeof options.decimals === "number"
      ? `ROUND(corr(${quoteIdentifier(comb[0])}, ${
        quoteIdentifier(comb[1])
      }), ${options.decimals})`
      : `corr(${quoteIdentifier(comb[0])}, ${quoteIdentifier(comb[1])})`;
    return `SELECT ${catSelect}? AS ${quoteIdentifier("x")}, ? AS ${
      quoteIdentifier("y")
    }, ${expression} AS ${quoteIdentifier("corr")} FROM ${input}${groupBy}`;
  });

  return branches.join("\nUNION ALL\n");
}
