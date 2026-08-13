import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import getSummaryExpression, {
  allSummaries,
  type Summary,
} from "../helpers/getSummaryExpression.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import resolveOutputTable from "../helpers/resolveOutputTable.ts";
import stringToArray from "../helpers/stringToArray.ts";

import type SimpleTable from "../class/SimpleTable.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";

type SummarizeOptions = {
  outputTable?: string | boolean;
  values?: string | string[];
  categories?: string | string[];
  summaries?: Summary | Summary[] | { [key: string]: Summary };
  decimals?: number;
  datesToMs?: boolean;
};

export default function summarize(
  simpleTable: SimpleTable,
  options: SummarizeOptions = {},
): SimpleTable {
  options = structuredClone(options);
  options.outputTable = resolveOutputTable(simpleTable, options.outputTable);
  const values = getSummarizeValues(options);
  const boundValues = values.length > 1 ? values : [];

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
            values: boundValues,
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
    values: boundValues,
    buildSelect: (input, types) => summarizeSelect(input, types, options),
  });
  return simpleTable;
}

function getSummarizeValues(options: SummarizeOptions): string[] {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  return [
    ...new Set(
      (options.values ? stringToArray(options.values) : []).filter(
        (value) => !categories.includes(value),
      ),
    ),
  ];
}

const timeTypes = [
  "DATE",
  "TIME",
  "TIMESTAMP",
  "TIMESTAMP_MS",
  "TIMESTAMP WITH TIME ZONE",
];

function summarizeSelect(
  input: string,
  types: TableSchema,
  options: SummarizeOptions,
): string {
  const categories = options.categories
    ? stringToArray(options.categories)
    : [];
  // Duplicated values would duplicate rows now that the branches are combined
  // with UNION ALL instead of a deduplicating UNION.
  const values = getSummarizeValues(options);

  let summaries: Summary[];
  let columns: string[] | undefined;
  if (options.summaries === undefined) {
    summaries = values.length === 0 ? ["count"] : [...allSummaries];
  } else if (typeof options.summaries === "string") {
    summaries = [options.summaries];
  } else if (Array.isArray(options.summaries)) {
    summaries = options.summaries.length === 0
      ? [...allSummaries]
      : options.summaries;
  } else {
    const entries = Object.entries(options.summaries);
    columns = entries.map((d) => d[0]);
    summaries = entries.map((d) => d[1]);
  }

  // The value column is a row key: it distinguishes the rows of different
  // value columns, so it appears only when there is more than one.
  const valueColumn = values.length > 1;

  // With datesToMs, dates are converted to milliseconds inside the aggregate
  // expressions (same conversions as convert()), so the input table is left
  // untouched instead of being rewritten.
  const references: { [column: string]: string } = {};
  const effectiveTypes: TableSchema = {};
  for (const value of values) {
    const type = types[value];
    if (
      options.datesToMs === true &&
      typeof type === "string" &&
      (type.includes("TIME") || type.includes("DATE"))
    ) {
      references[value] = type.includes("TIME")
        ? `(date_part('epoch', ${quoteIdentifier(value)}) * 1000)`
        : `(epoch(${quoteIdentifier(value)}) * 1000)`;
      effectiveTypes[value] = "BIGINT";
    } else {
      references[value] = `${quoteIdentifier(value)}`;
      effectiveTypes[value] = type;
    }
  }

  const typesOfValues = values.map((d) => effectiveTypes[d]);
  const doubleAndDate = typesOfValues.includes("DOUBLE") &&
    typesOfValues.filter((d) => timeTypes.includes(d)).length >= 1;
  if (doubleAndDate) {
    throw new Error(
      "You are trying to summarize numbers and timestamps/dates/times. You can specify values in the options (just numbers or just timestamps/dates/times) or convert your timestamps/dates/times to the number of ms since 1970-01-01 00:00:00 by passing the option { datesToMs: true }.",
    );
  }

  const catSelect = categories.map((d) => `${quoteIdentifier(d)}`).join(", ");
  const groupBy = categories.length > 0 ? `\nGROUP BY ${catSelect}` : "";

  // With no values, the only meaningful summary is the row count, which
  // doesn't need a value column (or any temporary column) at all.
  if (values.length === 0) {
    const summaryColumns = summaries.map((summary, i) => {
      const name = columns ? columns[i] : summary;
      return summary === "count"
        ? `CAST(COUNT(*) AS INTEGER) AS ${quoteIdentifier(name)}`
        : `NULL AS ${quoteIdentifier(name)}`;
    });
    const orderBy = categories.length > 0
      ? `\nORDER BY ${
        categories.map((d) => `${quoteIdentifier(d)} ASC`).join(", ")
      }`
      : "";
    return `SELECT ${
      [
        ...categories.map((d) => `${quoteIdentifier(d)}`),
        ...summaryColumns,
      ].join(", ")
    }\nFROM ${input}${groupBy}${orderBy}`;
  }

  // One UNION ALL branch per value column. DuckDB runs the branches as
  // concurrent pipelines, which parallelizes the expensive aggregates
  // (medians, distinct counts) better than computing them all in one scan.
  const branches: string[] = [];
  for (const value of values) {
    let hasAggregate = false;
    const projections = summaries.map((summary, j) => {
      const name = columns ? columns[j] : summary;
      const expression = getSummaryExpression(
        summary,
        effectiveTypes[value],
        references[value],
        options.decimals,
      );
      if (expression === null) {
        return `NULL AS ${quoteIdentifier(name)}`;
      }
      hasAggregate = true;
      return `${expression} AS ${quoteIdentifier(name)}`;
    });
    const select = `SELECT ${
      valueColumn ? `? AS ${quoteIdentifier("value")}, ` : ""
    }${catSelect === "" ? "" : `${catSelect}, `}${projections.join(", ")}`;
    if (categories.length === 0 && !hasAggregate) {
      // Every summary is NULL and there is nothing to group by: the branch
      // is a single constant row, so the input is not even scanned.
      branches.push(select);
    } else {
      branches.push(`${select}\nFROM ${input}${groupBy}`);
    }
  }

  const orderByColumns = valueColumn ? ["value", ...categories] : categories;
  const orderBy = orderByColumns.length > 0
    ? `\nORDER BY ${
      orderByColumns.map((d) => `${quoteIdentifier(d)} ASC`).join(", ")
    }`
    : "";

  return `${branches.join("\nUNION ALL\n")}${orderBy}`;
}
