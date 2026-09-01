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
  | {
    stat: IndexValueStat;
    column?: never;
    equals?: never;
    at?: never;
  }
  | {
    column: string;
    equals: string | number | bigint | boolean | Date;
    stat?: never;
    at?: never;
  }
  | {
    column: string;
    at: "min" | "max";
    stat?: never;
    equals?: never;
  };

type IndexValueOptions = {
  by?: string | string[];
  base?: number;
  decimals?: number;
};

export default function indexValues(
  simpleTable: SimpleTable,
  column: string,
  newColumn: string,
  reference: IndexValueReference,
  options: IndexValueOptions = {},
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
  const exactReference = columnReference?.equals !== undefined
    ? columnReference as Extract<IndexValueReference, { equals: unknown }>
    : undefined;
  const columnAtReference = columnReference?.at !== undefined
    ? columnReference as Extract<IndexValueReference, { at: "min" | "max" }>
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
        exactReference.equals,
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
      if (exactReference !== undefined) {
        validateExactReferenceValueType(
          exactReference.equals,
          exactReference.column,
          schema[exactReference.column],
        );
      }
      const partition = by.length === 0
        ? ""
        : `PARTITION BY ${by.map(quoteIdentifier).join(", ")}`;
      const quotedColumn = quoteIdentifier(column);
      if (columnAtReference !== undefined) {
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
          columnAtReference.column,
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
        const expression = getIndexedExpression(
          sourceColumn,
          calculatedReferenceValue,
          options.base ?? 100,
          options.decimals,
          calculatedMatchCount,
        );
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
          `${qualify(referenceAlias, columnAtReference.column)} = ${
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
          qualify(referenceAlias, columnAtReference.column)
        }) AS ${quotedMatchCountColumn},
            MAX(${
          qualify(referenceAlias, column)
        }) AS ${quotedReferenceValueColumn}
          FROM (
            SELECT ${extremaBySelect}${columnAtReference.at.toUpperCase()}(${quotedReferenceColumn}) AS ${quotedExtremeColumn}
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
        const expression = getIndexedExpression(
          quotedColumn,
          quotedReferenceValueColumn,
          options.base ?? 100,
          options.decimals,
          quotedMatchCountColumn,
        );
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
      const expression = getIndexedExpression(
        quotedColumn,
        quotedReferenceValueColumn,
        options.base ?? 100,
        options.decimals,
      );
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
      "indexValues() reference must contain stat, column and equals, or column and at.",
    );
  }
  if (typeof reference.column !== "string") {
    if (
      reference.stat === undefined || reference.equals !== undefined ||
      reference.at !== undefined
    ) {
      throw new Error(
        "indexValues() reference must contain stat, column and equals, or column and at.",
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
  if (reference.stat !== undefined) {
    throw new Error(
      "indexValues() reference.stat cannot be provided with reference.column. Use reference.at to select the minimum or maximum row.",
    );
  }
  const hasAt = reference.at !== undefined;
  const hasEquals = reference.equals !== undefined;
  if (hasAt === hasEquals) {
    throw new Error(
      hasAt
        ? "indexValues() reference cannot contain both equals and at."
        : "indexValues() reference must contain stat, column and equals, or column and at.",
    );
  }
  if (hasAt) {
    if (!(reference.at === "min" || reference.at === "max")) {
      throw new Error(
        'indexValues() reference.at must be "min" or "max".',
      );
    }
    return;
  }
  if (reference.equals === null || reference.equals === undefined) {
    throw new Error(
      "indexValues() reference.equals cannot be null or undefined.",
    );
  }
  const valueType = typeof reference.equals;
  if (
    !(reference.equals instanceof Date) &&
    !["string", "number", "bigint", "boolean"].includes(valueType)
  ) {
    throw new Error(
      "indexValues() reference.equals must be a string, number, bigint, boolean, or Date.",
    );
  }
  if (typeof reference.equals === "number" && Number.isNaN(reference.equals)) {
    throw new Error("indexValues() reference.equals cannot be NaN.");
  }
  if (
    reference.equals instanceof Date &&
    Number.isNaN(reference.equals.getTime())
  ) {
    throw new Error("indexValues() reference.equals must be a valid Date.");
  }
}

function validateExactReferenceValueType(
  value: string | number | bigint | boolean | Date,
  column: string,
  columnType: string,
): void {
  const valueType = value instanceof Date ? "Date" : typeof value;
  let expected: string | undefined;
  let valid = true;

  if (
    columnType === "VARCHAR" || columnType === "UUID" ||
    columnType.startsWith("ENUM(")
  ) {
    expected = "a string";
    valid = typeof value === "string";
  } else if (columnType === "BOOLEAN") {
    expected = "a boolean";
    valid = typeof value === "boolean";
  } else if (
    columnType === "BIGNUM" ||
    keepNumericalColumns({ [column]: columnType }).includes(column)
  ) {
    expected = "a number or bigint";
    valid = typeof value === "number" || typeof value === "bigint";
  } else if (
    [
      "DATE",
      "TIMESTAMP",
      "TIMESTAMP_S",
      "TIMESTAMP_MS",
      "TIMESTAMP_NS",
      "TIMESTAMP WITH TIME ZONE",
    ].includes(columnType)
  ) {
    expected = "a string or Date";
    valid = typeof value === "string" || value instanceof Date;
  } else if (
    ["TIME", "TIME WITH TIME ZONE", "INTERVAL"].includes(columnType)
  ) {
    expected = "a string";
    valid = typeof value === "string";
  }

  if (!valid) {
    throw new Error(
      `indexValues() reference.equals must be ${expected} for column ${
        quoteIdentifier(column)
      } with type ${columnType}, but received ${valueType}.`,
    );
  }
}

function getIndexedExpression(
  sourceValue: string,
  referenceValue: string,
  base: number,
  decimals: number | undefined,
  matchCount?: string,
): string {
  const indexedValue = `${sourceValue} / ${referenceValue} * ${base}`;
  const calculatedValue = decimals === undefined
    ? indexedValue
    : `ROUND(${indexedValue}, ${decimals})`;
  const referenceAction = matchCount === undefined ? "calculated" : "found";
  const cardinalityChecks = matchCount === undefined
    ? ""
    : `WHEN ${matchCount} = 0 THEN error('indexValues() found no reference row for at least one group.')
    WHEN ${matchCount} > 1 THEN error('indexValues() found multiple reference rows for at least one group.')
    `;

  return `CASE
    ${cardinalityChecks}WHEN ${referenceValue} IS NULL THEN error('indexValues() ${referenceAction} a null reference value for at least one group.')
    WHEN ${referenceValue} = 0 THEN error('indexValues() ${referenceAction} a zero reference value for at least one group.')
    WHEN ${sourceValue} IS NULL THEN NULL
    ELSE ${calculatedValue}
  END`;
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
