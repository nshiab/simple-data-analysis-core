import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import getStatExpression, {
  allStats,
  isTemporalStatType,
  type Stat,
} from "../helpers/getStatExpression.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import resolveOutputTable from "../helpers/resolveOutputTable.ts";
import stringToArray from "../helpers/stringToArray.ts";

import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

type SummarizeOptions = {
  outputTable?: string | boolean;
  columns?: string | string[];
  by?: string | string[];
  stats?: Stat | Stat[] | { [key: string]: Stat };
  decimals?: number;
  datesToMs?: boolean;
};

export default function summarize(
  simpleTable: SimpleTable,
  options: SummarizeOptions = {},
): SimpleTable {
  options = structuredClone(options);
  options.outputTable = resolveOutputTable(simpleTable, options.outputTable);
  const columns = getSummarizeColumns(options);
  const boundColumns = columns.length > 1 ? columns : [];

  if (typeof options.outputTable === "string") {
    // The output table instance is created at call time so it can be
    // returned synchronously and chained on right away.
    const outputTable = simpleTable.sdb.newTable(options.outputTable);
    queueOp(outputTable, {
      kind: "barrier",
      method: "summarize()",
      parameters: { options },
      execute: async () => {
        await queryDB(
          simpleTable,
          `CREATE OR REPLACE TABLE ${quoteIdentifier(outputTable.name)} AS ${
            summarizeSelect(
              `${quoteIdentifier(simpleTable.name)}`,
              await simpleTable.getTypes(),
              options,
            )
          }`,
          mergeOptions(simpleTable, {
            table: outputTable.name,
            method: "summarize()",
            parameters: { options },
            values: boundColumns,
          }),
        );
      },
    });
    return outputTable;
  }

  queueOp(simpleTable, {
    kind: "fusable",
    method: "summarize()",
    parameters: { options },
    needsSchema: true,
    values: boundColumns,
    buildSelect: (input, types) => summarizeSelect(input, types, options),
  });
  return simpleTable;
}

function getSummarizeColumns(options: SummarizeOptions): string[] {
  const by = options.by ? stringToArray(options.by) : [];
  return [
    ...new Set(
      (options.columns ? stringToArray(options.columns) : []).filter(
        (column) => !by.includes(column),
      ),
    ),
  ];
}

function summarizeSelect(
  input: string,
  types: TableSchema,
  options: SummarizeOptions,
): string {
  const by = options.by ? stringToArray(options.by) : [];
  // Duplicated columns would duplicate rows now that the branches are combined
  // with UNION ALL instead of a deduplicating UNION.
  const columns = getSummarizeColumns(options);

  let stats: Stat[];
  let outputColumns: string[] | undefined;
  if (options.stats === undefined) {
    stats = columns.length === 0 ? ["count"] : [...allStats];
  } else if (typeof options.stats === "string") {
    stats = [options.stats];
  } else if (Array.isArray(options.stats)) {
    stats = options.stats.length === 0 ? [...allStats] : options.stats;
  } else {
    const entries = Object.entries(options.stats);
    outputColumns = entries.map((d) => d[0]);
    stats = entries.map((d) => d[1]);
  }

  // The `column` output column is a row key that distinguishes rows for
  // different input columns, so it appears only when there is more than one.
  const columnColumn = columns.length > 1;

  // With datesToMs, dates are converted to milliseconds inside the aggregate
  // expressions (same conversions as convert()), so the input table is left
  // untouched instead of being rewritten.
  const references: { [column: string]: string } = {};
  const effectiveTypes: TableSchema = {};
  for (const column of columns) {
    const type = types[column];
    if (
      options.datesToMs === true &&
      typeof type === "string" &&
      (type.includes("TIME") || type.includes("DATE"))
    ) {
      references[column] = type.includes("TIME")
        ? `(date_part('epoch', ${quoteIdentifier(column)}) * 1000)`
        : `(epoch(${quoteIdentifier(column)}) * 1000)`;
      effectiveTypes[column] = "BIGINT";
    } else {
      references[column] = `${quoteIdentifier(column)}`;
      effectiveTypes[column] = type;
    }
  }

  const columnTypes = columns.map((d) => effectiveTypes[d]);
  const doubleAndDate = columnTypes.includes("DOUBLE") &&
    columnTypes.some(isTemporalStatType);
  if (doubleAndDate) {
    throw new Error(
      "You are trying to summarize numbers and timestamps/dates/times. You can specify columns in the options (just numbers or just timestamps/dates/times) or convert your timestamps/dates/times to the number of ms since 1970-01-01 00:00:00 by passing the option { datesToMs: true }.",
    );
  }

  const bySelect = by.map((d) => `${quoteIdentifier(d)}`).join(", ");
  const groupBy = by.length > 0 ? `\nGROUP BY ${bySelect}` : "";

  // With no columns, the only meaningful statistic is the row count, which
  // doesn't need an input-column label (or any temporary column) at all.
  if (columns.length === 0) {
    const statColumns = stats.map((stat, i) => {
      const name = outputColumns ? outputColumns[i] : stat;
      return stat === "count"
        ? `CAST(COUNT(*) AS INTEGER) AS ${quoteIdentifier(name)}`
        : `NULL AS ${quoteIdentifier(name)}`;
    });
    const orderBy = by.length > 0
      ? `\nORDER BY ${by.map((d) => `${quoteIdentifier(d)} ASC`).join(", ")}`
      : "";
    return `SELECT ${
      [
        ...by.map((d) => `${quoteIdentifier(d)}`),
        ...statColumns,
      ].join(", ")
    }\nFROM ${input}${groupBy}${orderBy}`;
  }

  // One UNION ALL branch per input column. DuckDB runs the branches as
  // concurrent pipelines, which parallelizes the expensive aggregates
  // (medians, distinct counts) better than computing them all in one scan.
  const branches: string[] = [];
  for (const column of columns) {
    let hasAggregate = false;
    const projections = stats.map((stat, j) => {
      const name = outputColumns ? outputColumns[j] : stat;
      const expression = getStatExpression(
        stat,
        effectiveTypes[column],
        references[column],
        options.decimals,
      );
      if (expression === null) {
        return `NULL AS ${quoteIdentifier(name)}`;
      }
      hasAggregate = true;
      return `${expression} AS ${quoteIdentifier(name)}`;
    });
    const select = `SELECT ${
      columnColumn ? `? AS ${quoteIdentifier("column")}, ` : ""
    }${bySelect === "" ? "" : `${bySelect}, `}${projections.join(", ")}`;
    if (by.length === 0 && !hasAggregate) {
      // Every statistic is NULL and there is nothing to group by: the branch
      // is a single constant row, so the input is not even scanned.
      branches.push(select);
    } else {
      branches.push(`${select}\nFROM ${input}${groupBy}`);
    }
  }

  const orderByColumns = columnColumn ? ["column", ...by] : by;
  const orderBy = orderByColumns.length > 0
    ? `\nORDER BY ${
      orderByColumns.map((d) => `${quoteIdentifier(d)} ASC`).join(", ")
    }`
    : "";

  return `${branches.join("\nUNION ALL\n")}${orderBy}`;
}
