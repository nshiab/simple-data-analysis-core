import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function bins(
  simpleTable: SimpleTable,
  column: string,
  interval: number,
  startColumn: string,
  endColumn: string,
  options: {
    startValue?: number;
  } = {},
) {
  // This validation does not need the database, so it stays at call time.
  if (!Number.isFinite(interval) || interval <= 0) {
    throw new Error(
      "bins() interval must be a finite number greater than 0.",
    );
  }
  if (typeof startColumn !== "string" || typeof endColumn !== "string") {
    throw new Error("bins() requires start and end output column names.");
  }
  if (startColumn.toLowerCase() === endColumn.toLowerCase()) {
    throw new Error(
      "bins() start and end output column names must be distinct.",
    );
  }
  if (
    options.startValue !== undefined && !Number.isFinite(options.startValue)
  ) {
    throw new Error("bins() startValue must be a finite number.");
  }
  // The intervals depend on the minimum and maximum values of the data, so
  // bins can't be expressed as a single SELECT over its input: it executes
  // as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "bins()",
    parameters: { column, interval, startColumn, endColumn, options },
    execute: async () => {
      await queryDB(
        simpleTable,
        await binsQuery(
          simpleTable,
          column,
          interval,
          startColumn,
          endColumn,
          options,
        ),
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "bins()",
          parameters: {
            column,
            interval,
            startColumn,
            endColumn,
            options,
          },
        }),
      );
    },
  });
}

async function binsQuery(
  SimpleTable: SimpleTable,
  column: string,
  interval: number,
  startColumn: string,
  endColumn: string,
  options: {
    startValue?: number;
  } = {},
) {
  // A SELECT *, expr AS col colliding with an existing column would be
  // silently renamed by DuckDB (col -> col_1) instead of erroring, unlike
  // the ALTER TABLE ADD this used to run.
  const types = await SimpleTable.getTypes();
  const existingColumns = Object.keys(types);
  assertNewColumns(
    types,
    [startColumn, endColumn].map((column) =>
      existingColumns.find((existing) =>
        existing.toLowerCase() === column.toLowerCase()
      ) ?? column
    ),
    "bins()",
  );

  // The minimum and maximum are computed in one scan instead of one
  // getMin/getMax query each.
  const minMax = await queryDB(
    SimpleTable,
    `SELECT MIN(${quoteIdentifier(column)}) AS "min", MAX(${
      quoteIdentifier(column)
    }) AS "max" FROM ${quoteIdentifier(SimpleTable.name)}`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      method: "bins()",
      parameters: { column, interval, startColumn, endColumn, options },
      returnData: true,
    }),
  );
  const minValue = minMax?.[0]?.min;
  if (typeof minValue !== "number" || !Number.isFinite(minValue)) {
    throw new Error(`minValue of ${column} is not a finite number`);
  }

  let startValue: number;
  if (typeof options.startValue === "number") {
    if (options.startValue > minValue) {
      throw new Error(
        `startValue ${options.startValue} can't be greater than minValue ${minValue}`,
      );
    }
    startValue = options.startValue;
  } else {
    startValue = minValue;
  }

  const maxValue = minMax?.[0]?.max;
  if (typeof maxValue !== "number" || !Number.isFinite(maxValue)) {
    throw new Error(`maxValue of ${column} is not a finite number`);
  }
  const starts: string[] = [];
  const ends: string[] = [];
  // Include the bin beginning at the maximum, even if floating-point division
  // places an exact boundary slightly below its integer index.
  const lastBin = Math.ceil((maxValue - startValue) / interval);
  if (!Number.isSafeInteger(lastBin)) {
    throw new Error("bins() range contains too many intervals.");
  }
  for (let i = 0; i <= lastBin; i++) {
    // Let SQL evaluate the boundaries from numeric literals, avoiding repeated
    // floating-point addition in JavaScript for fractional intervals.
    // Decimal indices also prevent integer-only expressions from overflowing
    // DuckDB's inferred INT32 type when an end exceeds that range.
    const start = `(${startValue} + ${i}.0 * ${interval})`;
    const end = `(${startValue} + ${i + 1}.0 * ${interval})`;
    const condition = `WHEN ${quoteIdentifier(column)} >= ${start} AND ${
      quoteIdentifier(column)
    } < ${end}`;
    starts.push(`${condition} THEN ${start}`);
    ends.push(`${condition} THEN ${end}`);
  }

  // Keep both outputs numeric, including fractional boundaries. Null source
  // values match no interval and yield null in both output columns.
  const query = `CREATE OR REPLACE TABLE ${quoteIdentifier(SimpleTable.name)} AS
    SELECT *,
      CAST(CASE ${starts.join("\n")} END AS DOUBLE) AS ${
    quoteIdentifier(startColumn)
  },
      CAST(CASE ${ends.join("\n")} END AS DOUBLE) AS ${
    quoteIdentifier(endColumn)
  }
    FROM ${quoteIdentifier(SimpleTable.name)}`;

  return query;
}
