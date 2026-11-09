import roundExpression from "../helpers/roundExpression.ts";
import { isNumericScalarType } from "../helpers/prepareNumericFeatures.ts";
import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import mergeOptions from "../helpers/mergeOptions.ts";
import queryDB from "../helpers/queryDB.ts";
import queueOp from "../helpers/queueOp.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function wider(
  simpleTable: SimpleTable,
  namesFrom: string,
  valuesFrom: string,
  options: {
    decimals?: number;
    stat?: "sum" | "count" | "min" | "max" | "mean" | "median" | "first";
  } = {},
) {
  // DuckDB rewrites PIVOT into multiple statements internally, so it can't
  // be part of a fused chain: it executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "wider()",
    parameters: { namesFrom, valuesFrom, options },
    execute: async () => {
      const { stat, decimals } = options;
      const types =
        stat === undefined || decimals !== undefined ? await simpleTable.getTypes() : {};
      const columns = Object.keys(types);
      const valueColumn =
        columns.find((name) => foldIdentifier(name) === foldIdentifier(valuesFrom)) ?? valuesFrom;
      const table = quoteIdentifier(simpleTable.name);
      const queryOptions = mergeOptions(simpleTable, {
        table: simpleTable.name,
        method: "wider()",
        parameters: { namesFrom, valuesFrom, options },
      });
      const aggregateFunction = stat === "mean" ? "avg" : (stat ?? "first");
      const type = decimals === undefined ? undefined : types[valueColumn];
      const outputType =
        stat === "count"
          ? "BIGINT"
          : (stat === "mean" || (stat === "median" && type !== "BIGNUM")) &&
              type !== undefined &&
              isNumericScalarType(type)
            ? "DOUBLE"
            : type;
      const expression = roundExpression(
        `${aggregateFunction}(${quoteIdentifier(valuesFrom)})`,
        decimals,
        outputType,
      );
      let pivotKey = quoteIdentifier(namesFrom);
      if (stat === undefined) {
        const nameColumn =
          columns.find((name) => foldIdentifier(name) === foldIdentifier(namesFrom)) ?? namesFrom;
        assertColumnsExist(types, [nameColumn, valueColumn], "wider()");
        const name = quoteIdentifier(nameColumn);
        // Use the same text key for the duplicate check and the output column.
        pivotKey = `CAST(${name} AS VARCHAR)`;
        const groupKeys = columns
          .filter((column) => column !== nameColumn && column !== valueColumn)
          .map(quoteIdentifier);
        const cellFields = [
          ...groupKeys.map((key) => `${key} := ${key}`),
          `${name} := ${pivotKey}`,
        ];
        const duplicates = await queryDB(
          simpleTable,
          `SELECT CAST(TO_JSON(STRUCT_PACK(${cellFields.join(", ")})) AS VARCHAR) AS cell
          FROM ${table} WHERE ${name} IS NOT NULL
          GROUP BY ${[...groupKeys, pivotKey].join(", ")}
          HAVING COUNT(*) > 1 LIMIT 1`,
          { ...queryOptions, returnData: true },
        );
        const duplicate = duplicates?.[0]?.cell;
        if (typeof duplicate === "string") {
          throw new Error(
            `wider() found multiple rows for pivot cell ${duplicate}. Pass options.stat (for example, { stat: "sum" }) to aggregate them, or remove the duplicate rows before calling wider().`,
          );
        }
      }
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE ${table} AS SELECT * FROM (PIVOT ${table} ON ${pivotKey} USING ${expression});`,
        queryOptions,
      );
    },
  });
}
