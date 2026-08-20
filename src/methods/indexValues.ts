import assertNewColumns from "../helpers/assertNewColumns.ts";
import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import getStatExpression, { type Stat } from "../helpers/getStatExpression.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import toDuckDBValue from "../helpers/toDuckDBValue.ts";
import type SimpleTable from "../class/SimpleTable.ts";
import { DuckDBTimestampTZValue, type DuckDBValue } from "@duckdb/node-api";

const indexValueStats = [
  "min",
  "max",
  "mean",
  "median",
] as const satisfies readonly Stat[];

type IndexValueStat = (typeof indexValueStats)[number];

type IndexValueReference =
  | { stat: IndexValueStat; column?: never; value?: never }
  | {
    column: string;
    value: string | number | bigint | boolean | Date;
    stat?: never;
  }
  | {
    column: string;
    stat: "min" | "max";
    value?: never;
  };

export default function indexValues(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  reference: IndexValueReference,
  options: {
    by?: string | string[];
    base?: number;
    decimals?: number;
  } = {},
) {
  validateReference(reference);
  if (
    options.base !== undefined &&
    (!Number.isFinite(options.base) || options.base <= 0)
  ) {
    throw new Error(
      "indexValues() options.base must be a finite number greater than 0.",
    );
  }
  if (
    options.decimals !== undefined &&
    (!Number.isFinite(options.decimals) ||
      !Number.isInteger(options.decimals) || options.decimals < 0)
  ) {
    throw new Error(
      "indexValues() options.decimals must be a finite integer greater than or equal to 0.",
    );
  }
  reference = structuredClone(reference);
  options = structuredClone(options);
  const columnReference = typeof reference.column === "string"
    ? reference as Exclude<IndexValueReference, { column?: never }>
    : undefined;
  const exactReference = columnReference?.value !== undefined
    ? columnReference as Extract<IndexValueReference, { value: unknown }>
    : undefined;
  const columnStatReference = columnReference?.stat !== undefined
    ? columnReference as Extract<IndexValueReference, { stat: "min" | "max" }>
    : undefined;
  const statReference = columnReference === undefined
    ? reference as Extract<IndexValueReference, { column?: never }>
    : undefined;
  queueOp(simpleTable, {
    kind: "fusable",
    method: "indexValues()",
    parameters: { column, newColumn, reference, options },
    needsSchema: true,
    values: exactReference === undefined ? undefined : (schema) => [
      bindReferenceValue(
        exactReference.value,
        schema[exactReference.column],
      ),
    ],
    buildSelect: (input, schema) => {
      assertNewColumns(schema, [newColumn], "indexValues()");
      const by = options.by ? stringToArray(options.by) : [];
      assertColumnsExist(
        schema,
        [
          column,
          ...by,
          ...(columnReference === undefined ? [] : [columnReference.column]),
        ],
        "indexValues()",
      );
      if (!keepNumericalColumns(schema).includes(column)) {
        throw new Error(
          `indexValues() requires a numeric column, but ${
            quoteIdentifier(column)
          } has type ${schema[column]}. Convert ${
            quoteIdentifier(column)
          } to a numeric type first.`,
        );
      }
      const partition = by.length === 0
        ? ""
        : `PARTITION BY ${by.map(quoteIdentifier).join(", ")}`;
      const quotedColumn = quoteIdentifier(column);
      if (columnStatReference !== undefined) {
        const rowOrderColumn = temporaryColumn(
          schema,
          "__sda_index_row_order",
        );
        const extremeColumn = temporaryColumn(
          schema,
          "__sda_index_extreme",
          [rowOrderColumn],
        );
        const matchCountColumn = temporaryColumn(
          schema,
          "__sda_index_match_count",
          [rowOrderColumn, extremeColumn],
        );
        const referenceValueColumn = temporaryColumn(
          schema,
          "__sda_index_reference_value",
          [rowOrderColumn, extremeColumn, matchCountColumn],
        );
        const quotedRowOrderColumn = quoteIdentifier(rowOrderColumn);
        const quotedExtremeColumn = quoteIdentifier(extremeColumn);
        const quotedMatchCountColumn = quoteIdentifier(matchCountColumn);
        const quotedReferenceValueColumn = quoteIdentifier(
          referenceValueColumn,
        );
        const quotedReferenceColumn = quoteIdentifier(
          columnStatReference.column,
        );
        const sourceAlias = quoteIdentifier("__sda_index_source");
        const extremaAlias = quoteIdentifier("__sda_index_extrema");
        const referenceAlias = quoteIdentifier("__sda_index_reference");
        const calculatedAlias = quoteIdentifier("__sda_index_calculated");
        const qualify = (alias: string, selectedColumn: string) =>
          `${alias}.${quoteIdentifier(selectedColumn)}`;
        const sourceColumn = qualify(sourceAlias, column);
        const calculatedReferenceValue = qualify(
          calculatedAlias,
          referenceValueColumn,
        );
        const calculatedMatchCount = qualify(
          calculatedAlias,
          matchCountColumn,
        );
        const indexedValue = `${sourceColumn} / ${calculatedReferenceValue} * ${
          options.base ?? 100
        }`;
        const calculatedValue = options.decimals === undefined
          ? indexedValue
          : `ROUND(${indexedValue}, ${options.decimals})`;
        const expression = `CASE
          WHEN ${calculatedMatchCount} = 0 THEN error('indexValues() found no reference row for at least one group.')
          WHEN ${calculatedMatchCount} > 1 THEN error('indexValues() found multiple reference rows for at least one group.')
          WHEN ${calculatedReferenceValue} IS NULL THEN error('indexValues() found a null reference value for at least one group.')
          WHEN ${calculatedReferenceValue} = 0 THEN error('indexValues() found a zero reference value for at least one group.')
          WHEN ${sourceColumn} IS NULL THEN NULL
          ELSE ${calculatedValue}
        END`;
        const extremaBySelect = by.length === 0
          ? ""
          : `${by.map(quoteIdentifier).join(", ")}, `;
        const extremaGroupBy = by.length === 0
          ? ""
          : ` GROUP BY ${by.map(quoteIdentifier).join(", ")}`;
        const extremaJoin = [
          ...by.map((byColumn) =>
            `${qualify(referenceAlias, byColumn)} IS NOT DISTINCT FROM ${
              qualify(extremaAlias, byColumn)
            }`
          ),
          `${qualify(referenceAlias, columnStatReference.column)} = ${
            qualify(extremaAlias, extremeColumn)
          }`,
        ].join(" AND ");
        const calculatedBySelect = by.length === 0
          ? ""
          : `${
            by.map((byColumn) => qualify(extremaAlias, byColumn)).join(", ")
          }, `;
        const calculatedGroupBy = by.length === 0
          ? ""
          : ` GROUP BY ${
            by.map((byColumn) => qualify(extremaAlias, byColumn)).join(", ")
          }`;
        const calculatedSubquery = `(SELECT ${calculatedBySelect}
            COUNT(${
          qualify(referenceAlias, columnStatReference.column)
        }) AS ${quotedMatchCountColumn},
            MAX(${
          qualify(referenceAlias, column)
        }) AS ${quotedReferenceValueColumn}
          FROM (
            SELECT ${extremaBySelect}${columnStatReference.stat.toUpperCase()}(${quotedReferenceColumn}) AS ${quotedExtremeColumn}
            FROM ${input}${extremaGroupBy}
          ) AS ${extremaAlias}
          LEFT JOIN ${input} AS ${referenceAlias} ON ${extremaJoin}${calculatedGroupBy}) AS ${calculatedAlias}`;
        const sourceJoin = by.length === 0
          ? `CROSS JOIN ${calculatedSubquery}`
          : `LEFT JOIN ${calculatedSubquery} ON ${
            by.map((byColumn) =>
              `${qualify(sourceAlias, byColumn)} IS NOT DISTINCT FROM ${
                qualify(calculatedAlias, byColumn)
              }`
            ).join(" AND ")
          }`;
        return `SELECT ${sourceAlias}.* EXCLUDE (${quotedRowOrderColumn}),
          ${expression} AS ${quoteIdentifier(newColumn)}
        FROM (SELECT *, ROW_NUMBER() OVER () AS ${quotedRowOrderColumn} FROM ${input}) AS ${sourceAlias}
        ${sourceJoin}
        ORDER BY ${qualify(sourceAlias, rowOrderColumn)}`;
      }
      if (exactReference !== undefined) {
        const matchColumn = temporaryColumn(schema, "__sda_index_match");
        const matchCountColumn = temporaryColumn(
          schema,
          "__sda_index_match_count",
          [matchColumn],
        );
        const referenceValueColumn = temporaryColumn(
          schema,
          "__sda_index_reference_value",
          [matchColumn, matchCountColumn],
        );
        const quotedMatchColumn = quoteIdentifier(matchColumn);
        const quotedMatchCountColumn = quoteIdentifier(matchCountColumn);
        const quotedReferenceValueColumn = quoteIdentifier(
          referenceValueColumn,
        );
        const indexedValue =
          `${quotedColumn} / ${quotedReferenceValueColumn} * ${
            options.base ?? 100
          }`;
        const calculatedValue = options.decimals === undefined
          ? indexedValue
          : `ROUND(${indexedValue}, ${options.decimals})`;
        const expression = `CASE
          WHEN ${quotedMatchCountColumn} = 0 THEN error('indexValues() found no reference row for at least one group.')
          WHEN ${quotedMatchCountColumn} > 1 THEN error('indexValues() found multiple reference rows for at least one group.')
          WHEN ${quotedReferenceValueColumn} IS NULL THEN error('indexValues() found a null reference value for at least one group.')
          WHEN ${quotedReferenceValueColumn} = 0 THEN error('indexValues() found a zero reference value for at least one group.')
          WHEN ${quotedColumn} IS NULL THEN NULL
          ELSE ${calculatedValue}
        END`;
        const quotedReferenceColumn = quoteIdentifier(exactReference.column);
        const matchInput =
          `SELECT *, ${quotedReferenceColumn} = ? AS ${quotedMatchColumn}
            FROM ${input}`;
        const excludedColumns = [
          quotedMatchColumn,
          quotedMatchCountColumn,
          quotedReferenceValueColumn,
        ].join(", ");
        return `SELECT * EXCLUDE (${excludedColumns}),
          ${expression} AS ${quoteIdentifier(newColumn)}
        FROM (
          SELECT *,
            COUNT(*) FILTER (WHERE ${quotedMatchColumn}) OVER (${partition}) AS ${quotedMatchCountColumn},
            MAX(${quotedColumn}) FILTER (WHERE ${quotedMatchColumn}) OVER (${partition}) AS ${quotedReferenceValueColumn}
          FROM (
            ${matchInput}
          )
        )`;
      }
      const referenceValue = getWindowStatExpression(
        statReference!.stat,
        schema[column],
        quotedColumn,
        partition,
      );
      const referenceValueColumn = temporaryColumn(
        schema,
        "__sda_index_reference_value",
      );
      const quotedReferenceValueColumn = quoteIdentifier(referenceValueColumn);
      const indexedValue = `${quotedColumn} / ${quotedReferenceValueColumn} * ${
        options.base ?? 100
      }`;
      const calculatedValue = options.decimals === undefined
        ? indexedValue
        : `ROUND(${indexedValue}, ${options.decimals})`;
      const expression = `CASE
        WHEN ${quotedReferenceValueColumn} IS NULL THEN error('indexValues() calculated a null reference value for at least one group.')
        WHEN ${quotedReferenceValueColumn} = 0 THEN error('indexValues() calculated a zero reference value for at least one group.')
        WHEN ${quotedColumn} IS NULL THEN NULL
        ELSE ${calculatedValue}
      END`;
      return `SELECT * EXCLUDE (${quotedReferenceValueColumn}),
        ${expression} AS ${quoteIdentifier(newColumn)}
      FROM (
        SELECT *, ${referenceValue} AS ${quotedReferenceValueColumn}
        FROM ${input}
      )`;
    },
  });
}

function validateReference(reference: IndexValueReference): void {
  if (reference === null || typeof reference !== "object") {
    throw new Error(
      "indexValues() reference must contain either stat or column and value.",
    );
  }
  if (typeof reference.column !== "string") {
    if (reference.stat === undefined || reference.value !== undefined) {
      throw new Error(
        "indexValues() reference must contain stat, column and value, or column and stat.",
      );
    }
    if (!(indexValueStats as readonly string[]).includes(reference.stat)) {
      throw new Error(
        `indexValues() reference.stat must be one of ${
          indexValueStats.map((stat) => JSON.stringify(stat)).join(", ")
        }.`,
      );
    }
    return;
  }
  const hasStat = reference.stat !== undefined;
  const hasValue = reference.value !== undefined;
  if (hasStat === hasValue) {
    throw new Error(
      hasStat
        ? "indexValues() reference cannot contain both value and stat."
        : "indexValues() reference must contain stat, column and value, or column and stat.",
    );
  }
  if (hasStat) {
    if (!(reference.stat === "min" || reference.stat === "max")) {
      throw new Error(
        'indexValues() reference.stat must be "min" or "max" when reference.column is provided.',
      );
    }
    return;
  }
  if (reference.value === null || reference.value === undefined) {
    throw new Error(
      "indexValues() reference.value cannot be null or undefined.",
    );
  }
  const valueType = typeof reference.value;
  if (
    !(reference.value instanceof Date) &&
    !["string", "number", "bigint", "boolean"].includes(valueType)
  ) {
    throw new Error(
      "indexValues() reference.value must be a string, number, bigint, boolean, or Date.",
    );
  }
  if (typeof reference.value === "number" && Number.isNaN(reference.value)) {
    throw new Error("indexValues() reference.value cannot be NaN.");
  }
  if (
    reference.value instanceof Date &&
    Number.isNaN(reference.value.getTime())
  ) {
    throw new Error("indexValues() reference.value must be a valid Date.");
  }
}

function getWindowStatExpression(
  stat: IndexValueStat,
  columnType: string | undefined,
  quotedColumn: string,
  partition: string,
): string {
  const aggregate = getStatExpression(
    stat,
    columnType,
    quotedColumn,
    undefined,
  );
  if (aggregate === null) {
    throw new Error(
      `indexValues() cannot calculate ${stat} for column ${quotedColumn} with type ${columnType}.`,
    );
  }
  return `${aggregate} OVER (${partition})`;
}

function bindReferenceValue(
  value: string | number | bigint | boolean | Date,
  columnType: string | undefined,
): DuckDBValue {
  if (
    value instanceof Date &&
    columnType?.includes("TIMESTAMP WITH TIME ZONE")
  ) {
    return new DuckDBTimestampTZValue(BigInt(value.getTime()) * 1000n);
  }
  return toDuckDBValue(value);
}

function temporaryColumn(
  schema: { [column: string]: string },
  base: string,
  reserved: string[] = [],
): string {
  let column = base;
  let suffix = 1;
  while (schema[column] !== undefined || reserved.includes(column)) {
    column = `${base}_${suffix++}`;
  }
  return column;
}
