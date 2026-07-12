import assertNewColumns from "../helpers/assertNewColumns.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function bins(
  simpleTable: SimpleTable,
  column: string,
  interval: number,
  newColumn: string,
  options: {
    startValue?: number;
  } = {},
) {
  // The intervals depend on the minimum and maximum values of the data, so
  // bins can't be expressed as a single SELECT over its input: it executes
  // as a barrier.
  queueOp(simpleTable, {
    kind: "barrier",
    method: "bins()",
    parameters: { column, interval, newColumn, options },
    execute: async () => {
      await queryDB(
        simpleTable,
        await binsQuery(simpleTable, column, interval, newColumn, options),
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "bins()",
          parameters: {
            column,
            interval,
            newColumn,
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
  newColumn: string,
  options: {
    startValue?: number;
  } = {},
) {
  // A SELECT *, expr AS col colliding with an existing column would be
  // silently renamed by DuckDB (col -> col_1) instead of erroring, unlike
  // the ALTER TABLE ADD this used to run.
  assertNewColumns(await SimpleTable.getTypes(), [newColumn], "bins()");

  // The minimum and maximum are computed in one scan instead of one
  // getMin/getMax query each.
  const minMax = await queryDB(
    SimpleTable,
    `SELECT MIN("${column}") AS "min", MAX("${column}") AS "max" FROM "${SimpleTable.name}"`,
    mergeOptions(SimpleTable, {
      table: SimpleTable.name,
      method: "bins()",
      parameters: { column, interval, newColumn, options },
      returnData: true,
    }),
  );
  const minValue = minMax?.[0]?.min;
  if (typeof minValue !== "number") {
    throw new Error(`minValue of ${column} is not a number`);
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
  if (typeof maxValue !== "number") {
    throw new Error(`maxValue of ${column} is not a number`);
  }
  const endValue = maxValue;

  let increment = 1;
  let decimals = 0;
  const intervalAsString = interval.toString();
  const decimalIndex = intervalAsString.indexOf(".");
  if (decimalIndex > 0) {
    decimals = intervalAsString.substring(decimalIndex + 1).length;
    increment = 1.0 / (10.0 * decimals);
  }

  const intervals: string[] = [];

  for (let i = startValue; i <= endValue; i += interval) {
    const start = i;
    const end = (i + interval - increment).toFixed(decimals);
    intervals.push(
      `WHEN "${column}" >= ${start} AND "${column}" <= ${end} THEN '[${start}-${end}]'`,
    );
  }

  // A single rewrite, so the table is scanned once instead of once for the
  // ALTER and once for the UPDATE.
  const query = `CREATE OR REPLACE TABLE "${SimpleTable.name}" AS
    SELECT *, CASE
    ${intervals.join("\n")}
    END AS "${newColumn}"
    FROM "${SimpleTable.name}"`;

  return query;
}
