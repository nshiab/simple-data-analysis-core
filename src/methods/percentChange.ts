import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import getStatExpression from "../helpers/getStatExpression.ts";
import { isNumericScalarType } from "../helpers/prepareNumericFeatures.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

const stats = ["mean", "median", "min", "max"] as const;
const method = "percentChange()";

export default function percentChange(
  simpleTable: SimpleTable,
  column: string,
  reference:
    | string
    | {
        stat: (typeof stats)[number];
        column?: string;
        by?: string | string[];
      },
  newColumn: string,
  options: {
    base?: number;
    decimals?: number;
  } = {},
) {
  if (
    typeof reference !== "string" &&
    (reference === null || typeof reference !== "object" || !stats.includes(reference.stat))
  ) {
    throw new Error(
      `${method} reference must be a column name or specify mean, median, min, or max.`,
    );
  }
  const { base = 1, decimals } = options;
  if (!Number.isFinite(base) || base <= 0) {
    throw new Error(`${method} options.base must be a finite number greater than 0.`);
  }
  if (decimals !== undefined && (!Number.isInteger(decimals) || decimals < 0)) {
    throw new Error(`${method} options.decimals must be a nonnegative integer.`);
  }

  const referenceColumn = typeof reference === "string" ? reference : (reference.column ?? column);
  const stat = typeof reference === "string" ? undefined : reference.stat;
  const by = typeof reference === "string" ? [] : [...stringToArray(reference.by ?? [])];

  queueOp(simpleTable, {
    kind: "fusable",
    method,
    parameters: { column, reference, newColumn, options },
    needsSchema: true,
    outputSchema: (schema) => ({ ...schema, [newColumn]: "DOUBLE" }),
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], method);
      assertColumnsExist(schema, [...new Set([column, referenceColumn, ...by])], method);
      for (const name of [column, referenceColumn]) {
        if (!isNumericScalarType(schema[name])) {
          throw new Error(
            `${method} requires a numeric column, but ${quoteIdentifier(name)} has type ${schema[name]}.`,
          );
        }
      }

      const quotedReference = quoteIdentifier(referenceColumn);
      let referenceExpression = quotedReference;
      if (stat !== undefined) {
        const aggregate = getStatExpression(
          stat,
          schema[referenceColumn],
          quotedReference,
          undefined,
        );
        if (aggregate === null) {
          throw new Error(`${method} cannot calculate ${stat} for column ${quotedReference}.`);
        }
        const partition =
          by.length === 0 ? "" : `PARTITION BY ${by.map(quoteIdentifier).join(", ")}`;
        referenceExpression = `${aggregate} OVER (${partition})`;
      }

      // Cast before subtracting so decreases work for unsigned columns, too.
      const value = `CAST(${quoteIdentifier(column)} AS DOUBLE)`;
      const baseline = `CAST(${referenceExpression} AS DOUBLE)`;
      const change = `(${value} - ${baseline}) / NULLIF(${baseline}, 0) * ${base}`;
      const result = decimals === undefined ? change : `ROUND(${change}, ${decimals})`;
      return `SELECT *, ${result} AS ${quoteIdentifier(newColumn)} FROM ${input}`;
    },
  });
}
