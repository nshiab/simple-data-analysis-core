import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import assertNewColumns from "../helpers/assertNewColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function normalize(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  options: {
    by?: string | string[];
    decimals?: number;
    range?: [number, number];
  } = {},
) {
  if (
    options.range !== undefined &&
    (!Array.isArray(options.range) ||
      options.range.length !== 2 ||
      !Number.isFinite(options.range[0]) ||
      !Number.isFinite(options.range[1]) ||
      options.range[0] >= options.range[1])
  ) {
    throw new Error(
      "normalize() options.range must contain two finite numbers in ascending order.",
    );
  }
  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "normalize()",
    parameters: { column, newColumn, options },
    needsSchema: true,
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], "normalize()");

      const by = options.by ? stringToArray(options.by) : [];
      const partition = by.length > 0
        ? `PARTITION BY ${by.map((d) => `${quoteIdentifier(d)}`).join(", ")}`
        : "";

      const normalizedQuery = `(${quoteIdentifier(column)} - MIN(${
        quoteIdentifier(column)
      }) OVER(${partition}))
    /
    (MAX(${quoteIdentifier(column)}) OVER(${partition}) - MIN(${
        quoteIdentifier(column)
      }) OVER(${partition}))`;
      const [rangeMin, rangeMax] = options.range ?? [0, 1];
      const scaledQuery = options.range === undefined
        ? normalizedQuery
        : `${rangeMin} + (${normalizedQuery}) * ${rangeMax - rangeMin}`;

      return `SELECT *, (
        ${
        typeof options.decimals === "number"
          ? `ROUND(${scaledQuery}, ${options.decimals})`
          : scaledQuery
      }
        ) AS ${quoteIdentifier(newColumn)},
    FROM ${input}`;
    },
  });
}
