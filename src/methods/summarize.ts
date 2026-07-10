import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import removeColumnsNow from "../helpers/removeColumnsNow.ts";
import stringToArray from "../helpers/stringToArray.ts";
import { convertSelect } from "./convert.ts";

import type SimpleTable from "../class/SimpleTable.ts";

export default function summarize(
  simpleTable: SimpleTable,
  options: {
    outputTable?: string | boolean;
    values?: string | string[];
    categories?: string | string[];
    summaries?:
      | (
        | "count"
        | "countUnique"
        | "countNull"
        | "min"
        | "max"
        | "mean"
        | "median"
        | "sum"
        | "skew"
        | "stdDev"
        | "var"
      )
      | (
        | "count"
        | "countUnique"
        | "countNull"
        | "min"
        | "max"
        | "mean"
        | "median"
        | "sum"
        | "skew"
        | "stdDev"
        | "var"
      )[]
      | {
        [key: string]:
          | "count"
          | "countUnique"
          | "countNull"
          | "min"
          | "max"
          | "mean"
          | "median"
          | "sum"
          | "skew"
          | "stdDev"
          | "var";
      };
    decimals?: number;
    datesToMs?: boolean;
    valueColumn?: boolean;
  } = {},
): SimpleTable {
  if (options.outputTable === true) {
    options.outputTable = `table${simpleTable.sdb.tableIncrement}`;
    simpleTable.sdb.tableIncrement += 1;
  }

  // The summary needs the schema, optional unit conversions and a temporary
  // row number, so it can't be expressed as a single SELECT over its input:
  // it executes as a barrier. The output table instance is created at call
  // time so it can be returned synchronously and chained on right away.
  const outputTable = typeof options.outputTable === "string"
    ? simpleTable.sdb.newTable(options.outputTable)
    : simpleTable;

  queueOp(outputTable, {
    kind: "barrier",
    method: "summarize()",
    parameters: { options },
    execute: () => executeSummarize(simpleTable, outputTable, options),
  });

  return outputTable;
}

async function executeSummarize(
  SimpleTable: SimpleTable,
  output: SimpleTable,
  options: {
    outputTable?: string | boolean;
    values?: string | string[];
    categories?: string | string[];
    summaries?:
      | (
        | "count"
        | "countUnique"
        | "countNull"
        | "min"
        | "max"
        | "mean"
        | "median"
        | "sum"
        | "skew"
        | "stdDev"
        | "var"
      )
      | (
        | "count"
        | "countUnique"
        | "countNull"
        | "min"
        | "max"
        | "mean"
        | "median"
        | "sum"
        | "skew"
        | "stdDev"
        | "var"
      )[]
      | {
        [key: string]:
          | "count"
          | "countUnique"
          | "countNull"
          | "min"
          | "max"
          | "mean"
          | "median"
          | "sum"
          | "skew"
          | "stdDev"
          | "var";
      };
    decimals?: number;
    datesToMs?: boolean;
    valueColumn?: boolean;
  } = {},
) {
  const outputTable = output.name;

  options.values = options.values ? stringToArray(options.values) : [];
  if (options.values.length === 0) {
    // The temporary row number is created directly (not with the sync
    // addRowNumber builder, which would queue for the next flush).
    await queryDB(
      SimpleTable,
      `CREATE OR REPLACE TABLE "${SimpleTable.name}" AS SELECT *, (ROW_NUMBER() OVER(ORDER BY rowid) - 1) AS "rowNumberToSummarizeQuerySDA" FROM "${SimpleTable.name}" ORDER BY rowid`,
      mergeOptions(SimpleTable, {
        table: SimpleTable.name,
        method: "summarize()",
        parameters: { options },
      }),
    );
    options.values = ["rowNumberToSummarizeQuerySDA"];
  }
  options.categories = options.categories
    ? stringToArray(options.categories)
    : [];
  let columns: string[] | undefined;
  if (options.summaries === undefined) {
    if (
      options.values.length === 1 &&
      options.values[0] === "rowNumberToSummarizeQuerySDA"
    ) {
      options.summaries = ["count"];
    } else {
      options.summaries = [];
    }
  } else if (typeof options.summaries === "string") {
    options.summaries = [options.summaries];
  } else if (
    !Array.isArray(options.summaries) && typeof options.summaries === "object"
  ) {
    const entries = Object.entries(options.summaries);
    columns = entries.map((d) => d[0]);
    options.summaries = entries.map((d) => d[1]);
  }

  const types = await SimpleTable.getTypes();
  if (options.datesToMs) {
    const originalTypes = { ...types };
    const toMsObj: {
      [key: string]: "bigint";
    } = {};
    for (const key of Object.keys(types)) {
      if (types[key].includes("TIME") || types[key].includes("DATE")) {
        toMsObj[key] = "bigint";
        types[key] = "bigint";
      }
    }
    if (Object.keys(toMsObj).length > 0) {
      // The conversion runs directly (not with the sync convert builder,
      // which would queue for the next flush).
      await queryDB(
        SimpleTable,
        `CREATE OR REPLACE TABLE "${SimpleTable.name}" AS ${
          convertSelect(
            `"${SimpleTable.name}"`,
            Object.keys(toMsObj),
            Object.values(toMsObj),
            Object.keys(originalTypes),
            originalTypes,
            {},
          )
        }`,
        mergeOptions(SimpleTable, {
          table: SimpleTable.name,
          method: "summarize()",
          parameters: { options },
        }),
      );
    }
  }

  options.values = options.values.filter(
    (d) => !options.categories?.includes(d),
  );

  await queryDB(
    SimpleTable,
    summarizeQuery(
      SimpleTable.name,
      types,
      outputTable,
      options.values,
      options.categories,
      options.summaries,
      options,
      columns,
    ),
    mergeOptions(SimpleTable, {
      table: outputTable,
      method: "summarize()",
      parameters: {
        options,
      },
    }),
  );

  if (options.values.includes("rowNumberToSummarizeQuerySDA")) {
    if (await SimpleTable.hasColumn("rowNumberToSummarizeQuerySDA")) {
      await removeColumnsNow(
        SimpleTable,
        ["rowNumberToSummarizeQuerySDA"],
        "summarize()",
      );
    }
    await SimpleTable.sdb.customQuery(
      `ALTER TABLE "${outputTable}" DROP COLUMN value;`,
    );
  }
}

function summarizeQuery(
  table: string,
  types: {
    [key: string]: string;
  },
  outputTable: string,
  values: string[],
  categories: string[],
  summaries: (
    | "count"
    | "countUnique"
    | "countNull"
    | "min"
    | "max"
    | "mean"
    | "median"
    | "sum"
    | "skew"
    | "stdDev"
    | "var"
  )[],
  options: { decimals?: number; valueColumn?: boolean } = {},
  columns: string[] | undefined,
) {
  if (values.length > 1 && options.valueColumn === false) {
    throw new Error(
      "The option `valueColumn: false` works only when you aggregate the values from one column. Remove the option `valueColumn` or specify just one column in the option `values`.",
    );
  }

  const typesOfValues = values.map((d) => types[d]);

  const doubleAndDate = Object.values(typesOfValues).includes("DOUBLE") &&
    Object.values(typesOfValues).filter((d) =>
        [
          "DATE",
          "TIME",
          "TIMESTAMP",
          "TIMESTAMP_MS",
          "TIMESTAMP WITH TIME ZONE",
        ].includes(d)
      ).length >= 1;

  if (doubleAndDate) {
    throw new Error(
      "You are trying to summarize numbers and timestamps/dates/times. You can specify values in the options (just numbers or just timestamps/dates/times) or convert your timestamps/dates/times to the number of ms since 1970-01-01 00:00:00 by passing the option { datesToMs: true }.",
    );
  }

  const aggregates: { [key: string]: string } = {
    count: "count", // specific implementation
    countUnique: "countUnique", // specific implementation
    countNull: "countNull", // Specific implementation
    min: "MIN(",
    max: "MAX(",
    mean: "AVG(",
    median: "MEDIAN(",
    sum: "SUM(",
    skew: "SKEWNESS(",
    stdDev: "STDDEV(",
    var: "VARIANCE(",
  };

  if (summaries.length === 0) {
    summaries = Object.keys(aggregates) as (
      | "count"
      | "countUnique"
      | "countNull"
      | "min"
      | "max"
      | "mean"
      | "median"
      | "sum"
      | "skew"
      | "stdDev"
      | "var"
    )[];
  }

  let query = `CREATE OR REPLACE TABLE "${outputTable}" AS`;

  let firstValue = true;
  for (const value of values) {
    if (firstValue) {
      firstValue = false;
    } else {
      query += "\nUNION";
    }
    query += `\nSELECT ${
      options.valueColumn === false ? "" : `'${value}' AS 'value'`
    }${
      categories.length > 0
        ? `, ${categories.map((d) => `"${d}"`).join(", ")}`
        : ""
    },${
      summaries.map((summary, i) => {
        if (
          value === "rowNumberToSummarizeQuerySDA" &&
          aggregates[summary] !== "count"
        ) {
          return `\nNULL as '${columns ? columns[i] : summary}'`;
        } else if (types[value].toLowerCase().includes("geometry")) {
          return `\nNULL AS '${columns ? columns[i] : summary}'`;
        } else if (
          types[value] === "VARCHAR" &&
          [
            "MIN(",
            "MAX(",
            "AVG(",
            "MEDIAN(",
            "SUM(",
            "SKEWNESS(",
            "STDDEV(",
            "VARIANCE(",
          ].includes(aggregates[summary])
        ) {
          return `\nNULL AS '${columns ? columns[i] : summary}'`;
        } else if (
          [
            "DATE",
            "TIME",
            "TIMESTAMP",
            "TIMESTAMP_MS",
            "TIMESTAMP WITH TIME ZONE",
          ].includes(types[value]) &&
          ["AVG(", "SUM(", "SKEWNESS(", "STDDEV(", "VARIANCE("].includes(
            aggregates[summary],
          )
        ) {
          return `\nNULL AS '${columns ? columns[i] : summary}'`;
        } else if (summary === "count") {
          return `\nCAST(COUNT(*) AS INTEGER) AS '${
            columns ? columns[i] : "count"
          }'`;
        } else if (summary === "countUnique") {
          return `\nCAST(COUNT(DISTINCT "${value}") AS INTEGER) AS '${
            columns ? columns[i] : "countUnique"
          }'`;
        } else if (summary === "countNull") {
          return `\nCAST(COUNT(CASE WHEN "${value}" IS NULL THEN 1 END) AS INTEGER) as '${
            columns ? columns[i] : "countNull"
          }'`;
        } else {
          return typeof options.decimals === "number" &&
              ![
                "VARCHAR",
                "DATE",
                "TIME",
                "TIMESTAMP",
                "TIMESTAMP WITH TIME ZONE",
              ].includes(types[value])
            ? `\nROUND(${
              aggregates[summary]
            }"${value}"), ${options.decimals}) AS '${
              columns ? columns[i] : summary
            }'`
            : `\n${aggregates[summary]}"${value}") AS '${
              columns ? columns[i] : summary
            }'`;
        }
      })
    }\nFROM "${table}"`;
    if (categories.length > 0) {
      query += `\nGROUP BY ${categories.map((d) => `"${d}"`).join(", ")}`;
    }
  }

  if (options.valueColumn === false) {
    if (categories.length > 0) {
      query += `\nORDER BY ${categories.map((d) => `"${d}" ASC`).join(", ")}`;
    }
  } else {
    query += `\nORDER BY ${
      ["value", ...categories]
        .map((d) => `"${d}" ASC`)
        .join(", ")
    }`;
  }

  return query.replace("SELECT ,", "SELECT ");
}
