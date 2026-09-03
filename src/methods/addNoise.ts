import assertColumnsExist from "../helpers/assertColumnsExist.ts";
import keepNumericalColumns from "../helpers/keepNumericalColumns.ts";
import type { TableSchema } from "../helpers/pendingOps.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";
import stringToArray from "../helpers/stringToArray.ts";
import type SimpleTable from "../class/SimpleTable.ts";

export default function addNoise(
  simpleTable: SimpleTable,
  columns: string | string[],
  max: number,
  options: { onlyDuplicates?: boolean } = {},
) {
  // This validation doesn't need the database, so it stays at call time.
  if (!Number.isFinite(max) || max < 0) {
    throw new Error(
      "addNoise() max must be a finite number greater than or equal to 0.",
    );
  }

  const cols = stringToArray(columns);
  if (cols.length === 0) {
    throw new Error("addNoise() requires at least one column.");
  }
  const duplicateColumns = cols.filter((column, index) =>
    cols.indexOf(column) !== index
  );
  if (duplicateColumns.length > 0) {
    const duplicates = [...new Set(duplicateColumns)];
    throw new Error(
      `addNoise() received duplicate column${
        duplicates.length === 1 ? "" : "s"
      } ${
        duplicates.map(quoteIdentifier).join(", ")
      }. Include each column only once.`,
    );
  }

  options = structuredClone(options);
  queueOp(simpleTable, {
    kind: "fusable",
    method: "addNoise()",
    parameters: { columns: cols, max, options },
    needsSchema: true,
    outputSchema: (schema) => ({
      ...schema,
      ...Object.fromEntries(cols.map((column) => [column, "DOUBLE"])),
    }),
    buildSelect: (input, schema) =>
      addNoiseSelect(input, schema, cols, max, options.onlyDuplicates === true),
  });
}

function addNoiseSelect(
  input: string,
  schema: TableSchema,
  columns: string[],
  max: number,
  onlyDuplicates: boolean,
): string {
  assertColumnsExist(schema, columns, "addNoise()");

  const numericalColumns = new Set(keepNumericalColumns(schema));
  const nonNumericalColumns = columns.filter((column) =>
    !numericalColumns.has(column)
  );
  if (nonNumericalColumns.length > 0) {
    throw new Error(
      `addNoise() requires numeric columns, but ${
        nonNumericalColumns.map((column) =>
          `${quoteIdentifier(column)} has type ${schema[column]}`
        ).join(", ")
      }. Convert ${
        nonNumericalColumns.length === 1 ? "it" : "them"
      } to a numeric type first.`,
    );
  }

  const duplicateCondition = onlyDuplicates
    ? `COUNT(*) OVER (PARTITION BY ${
      columns.map(quoteIdentifier).join(", ")
    }) > 1`
    : "TRUE";
  const replacements = columns.map((column) => {
    const quotedColumn = quoteIdentifier(column);
    return `CASE
      WHEN ${quotedColumn} IS NULL THEN NULL
      WHEN ${duplicateCondition}
        THEN CAST(${quotedColumn} AS DOUBLE) + (random() * 2 - 1) * ${max}
      ELSE CAST(${quotedColumn} AS DOUBLE)
    END AS ${quotedColumn}`;
  }).join(", ");

  return `SELECT * REPLACE (${replacements}) FROM ${input}`;
}
