import roundExpression from "../helpers/roundExpression.ts";
import { isNumericScalarType } from "../helpers/prepareNumericFeatures.ts";
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
  const stat = options.stat ?? "sum";
  const aggregateFunction = stat === "mean" ? "avg" : stat;

  // DuckDB rewrites PIVOT into multiple statements internally, so it can't
  // be part of a fused chain: it executes as a barrier.
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "barrier",
    method: "wider()",
    parameters: { namesFrom, valuesFrom, options },
    execute: async () => {
      const type =
        options.decimals === undefined
          ? undefined
          : Object.entries(await simpleTable.getTypes()).find(
              ([name]) => foldIdentifier(name) === foldIdentifier(valuesFrom),
            )?.[1];
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
        options.decimals,
        outputType,
      );
      await queryDB(
        simpleTable,
        `CREATE OR REPLACE TABLE ${quoteIdentifier(
          simpleTable.name,
        )} AS SELECT * FROM (PIVOT ${quoteIdentifier(simpleTable.name)} ON ${quoteIdentifier(
          namesFrom,
        )} USING ${expression});`,
        mergeOptions(simpleTable, {
          table: simpleTable.name,
          method: "wider()",
          parameters: { namesFrom, valuesFrom, options },
        }),
      );
    },
  });
}
