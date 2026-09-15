import type SimpleTable from "../class/SimpleTable.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

const NUMERIC_SCALAR_TYPE =
  /^(?:TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|BIGNUM|FLOAT|REAL|DOUBLE|DECIMAL\(\d+,\d+\))$/;

/** Returns whether a DuckDB type is a scalar numeric type. */
export function isNumericScalarType(type: string): boolean {
  return NUMERIC_SCALAR_TYPE.test(type);
}

export type NumericFeatureInput =
  | { kind: "scalars"; columns: string[] }
  | { kind: "vector"; column: string };

export type PreparedNumericFeatures = {
  /** Raw temporary-relation name. Quote it before embedding it in SQL. */
  relation: string;
  /** Raw private row-identity column name. */
  rowIdColumn: string;
  /** Raw private `DOUBLE[d]` feature column name. */
  vectorColumn: string;
  dimensions: number;
  rowCount: number;
  /** Source column names in their original order and spelling. */
  sourceColumns: string[];
  sourceTemporary: boolean;
  /** Drops all scratch state owned by this preparation. Safe to call twice. */
  cleanup: () => Promise<void>;
};

/**
 * Prepares scalar columns or a vector column as a private `DOUBLE[d]` feature
 * vector while retaining every source column in DuckDB. Converting large
 * integers or exact decimals to DOUBLE can lose precision. The source columns
 * remain unchanged, so callers can publish results from the returned snapshot.
 *
 * The private row identity is positional and distinguishes duplicate rows. A
 * caller owns the returned relation and must invoke `cleanup()` in `finally`.
 * Preparation failures clean up their own scratch state.
 */
export default async function prepareNumericFeatures(
  table: SimpleTable,
  input: NumericFeatureInput,
  options: {
    method: string;
    rejectNulls?: boolean;
    rejectNonFinite?: boolean;
  },
): Promise<PreparedNumericFeatures> {
  const rejectNulls = options.rejectNulls ?? true;
  const rejectNonFinite = options.rejectNonFinite ?? true;
  const types = await table.getTypes();
  const sourceColumns = Object.keys(types);
  const resolveColumn = (requested: string): string => {
    const resolved = sourceColumns.find((column) =>
      column.toLowerCase() === requested.toLowerCase()
    );
    if (resolved === undefined) {
      throw new Error(
        `${options.method} could not find column ${
          quoteIdentifier(requested)
        }. Available columns: ${
          sourceColumns.map(quoteIdentifier).join(", ")
        }.`,
      );
    }
    return resolved;
  };

  let selectedColumns: string[];
  let vectorType: { fixedDimensions?: number } | undefined;
  if (input.kind === "scalars") {
    if (input.columns.length === 0) {
      throw new Error(
        `${options.method} requires at least one numeric scalar column.`,
      );
    }
    const duplicate = findDuplicate(input.columns);
    if (duplicate !== undefined) {
      throw new Error(
        `${options.method} received duplicate input column ${
          quoteIdentifier(duplicate)
        }. Each numeric feature column must be listed once.`,
      );
    }
    selectedColumns = input.columns.map(resolveColumn);
    const nonNumeric = selectedColumns.filter((column) =>
      !isNumericScalarType(types[column])
    );
    if (nonNumeric.length > 0) {
      throw new Error(
        `${options.method} requires numeric scalar columns. The following input columns are not numeric scalars: ${
          nonNumeric.map((column) =>
            `${quoteIdentifier(column)} (${types[column]})`
          ).join(", ")
        }. Convert them to numeric scalar types first.`,
      );
    }
  } else {
    const column = resolveColumn(input.column);
    selectedColumns = [column];
    vectorType = parseNumericVectorType(types[column]);
    if (vectorType === undefined) {
      throw new Error(
        `${options.method} requires a one-dimensional numeric LIST or ARRAY column, but ${
          quoteIdentifier(column)
        } has type ${types[column]}.`,
      );
    }
  }

  const connection = table.connection!;
  const source = quoteIdentifier(table.name);
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const relation = `__sda_features_${suffix}`;
  const rowIdColumn = `__sda_row_${suffix}`;
  const vectorColumn = `__sda_vector_${suffix}`;
  const preparedRelation = quoteIdentifier(relation);
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    await connection.run(`DROP TABLE IF EXISTS ${preparedRelation}`);
    cleaned = true;
  };

  try {
    const tableDetails = (await connection.runAndReadAll(
      `SELECT table_oid, temporary FROM duckdb_tables()
       WHERE lower(table_name) = lower($1)
         AND schema_name = current_schema()
         AND database_name IN (current_database(), 'temp')
       ORDER BY temporary DESC LIMIT 1`,
      [table.name],
    )).getRowsJS()[0];
    if (tableDetails === undefined) {
      throw new Error(
        `${options.method} requires a materialized source table.`,
      );
    }
    const sourceTemporary = Boolean(tableDetails[1]);
    const rowCount = Number(
      (await connection.runAndReadAll(`SELECT count(*) FROM ${source}`))
        .getRowsJS()[0][0],
    );

    let dimensions: number;
    let vectorExpression: string;
    if (input.kind === "scalars") {
      dimensions = selectedColumns.length;
      await rejectInvalidScalarRows(
        connection,
        source,
        selectedColumns,
        options.method,
        { rejectNulls, rejectNonFinite },
      );
      vectorExpression = `[${
        selectedColumns.map((column) => `${quoteIdentifier(column)}::DOUBLE`)
          .join(", ")
      }]::DOUBLE[${dimensions}]`;
    } else {
      const column = selectedColumns[0];
      const quotedColumn = quoteIdentifier(column);
      const emptyRows = Number(
        (await connection.runAndReadAll(
          `SELECT count(*) FROM ${source}
           WHERE ${quotedColumn} IS NOT NULL AND len(${quotedColumn}) = 0`,
        )).getRowsJS()[0][0],
      );
      if (emptyRows > 0) {
        throw new Error(
          `${options.method} found ${emptyRows} row${
            emptyRows === 1 ? "" : "s"
          } with an empty vector in column ${
            quoteIdentifier(column)
          }. Vectors must have a nonzero dimension.`,
        );
      }
      await rejectInvalidVectorRows(
        connection,
        source,
        column,
        options.method,
        { rejectNulls, rejectNonFinite },
      );

      if (vectorType?.fixedDimensions !== undefined) {
        dimensions = vectorType.fixedDimensions;
      } else {
        const dimensionRows = (await connection.runAndReadAll(
          `SELECT len(${quotedColumn}) AS dimensions
           FROM ${source} WHERE ${quotedColumn} IS NOT NULL LIMIT 1`,
        )).getRowsJS();
        if (dimensionRows.length === 0) {
          throw new Error(
            `${options.method} could not determine a vector dimension for ${
              quoteIdentifier(column)
            }. Provide at least one non-null, nonempty vector.`,
          );
        }
        dimensions = Number(dimensionRows[0][0]);
      }

      const distinctDimensions = Number(
        (await connection.runAndReadAll(
          `SELECT count(DISTINCT len(${quotedColumn})) FROM ${source}
           WHERE ${quotedColumn} IS NOT NULL`,
        )).getRowsJS()[0][0],
      );
      if (distinctDimensions > 1) {
        throw new Error(
          `${options.method} requires vectors with equal dimensions, but column ${
            quoteIdentifier(column)
          } contains ${distinctDimensions} different lengths.`,
        );
      }
      vectorExpression = `${quotedColumn}::DOUBLE[${dimensions}]`;
    }

    await connection.run(
      `CREATE TEMP TABLE ${preparedRelation} AS
       SELECT *, row_number() OVER () - 1 AS ${
        quoteIdentifier(rowIdColumn)
      }, ${vectorExpression} AS ${quoteIdentifier(vectorColumn)}
       FROM ${source}`,
    );

    return {
      relation,
      rowIdColumn,
      vectorColumn,
      dimensions,
      rowCount,
      sourceColumns,
      sourceTemporary,
      cleanup,
    };
  } catch (error) {
    await cleanup();
    throw error;
  }
}

function parseNumericVectorType(
  type: string,
): { fixedDimensions?: number } | undefined {
  const match = /^(.+)\[(\d*)\]$/.exec(type);
  if (match === null || !isNumericScalarType(match[1])) return undefined;
  if (match[2] === "") return {};
  const fixedDimensions = Number(match[2]);
  return fixedDimensions > 0 ? { fixedDimensions } : undefined;
}

function findDuplicate(columns: string[]): string | undefined {
  const seen = new Set<string>();
  for (const column of columns) {
    const folded = column.toLowerCase();
    if (seen.has(folded)) return column;
    seen.add(folded);
  }
  return undefined;
}

async function rejectInvalidScalarRows(
  connection: SimpleTable["connection"],
  source: string,
  columns: string[],
  method: string,
  validation: { rejectNulls: boolean; rejectNonFinite: boolean },
) {
  const predicates = columns.map((column) => {
    const value = quoteIdentifier(column);
    const checks: string[] = [];
    if (validation.rejectNulls) checks.push(`${value} IS NULL`);
    if (validation.rejectNonFinite) {
      checks.push(
        `(${value} IS NOT NULL AND (TRY_CAST(${value} AS DOUBLE) IS NULL OR NOT isfinite(TRY_CAST(${value} AS DOUBLE))))`,
      );
    }
    return checks.length === 0 ? "FALSE" : `(${checks.join(" OR ")})`;
  });
  if (predicates.every((predicate) => predicate === "FALSE")) return;
  const aliases = columns.map((_, index) => `invalid_${index}`);
  const query = `SELECT
    count(*) FILTER (WHERE ${predicates.join(" OR ")}) AS invalid_rows,
    ${
    predicates.map((predicate, index) =>
      `count(*) FILTER (WHERE ${predicate}) AS ${aliases[index]}`
    ).join(", ")
  }
    FROM ${source}`;
  const row = (await connection.runAndReadAll(query)).getRowsJS()[0];
  const invalidRows = Number(row[0]);
  if (invalidRows === 0) return;
  const affected = columns.flatMap((column, index) => {
    const count = Number(row[index + 1]);
    return count === 0
      ? []
      : [`${quoteIdentifier(column)} (${count} row${count === 1 ? "" : "s"})`];
  });
  throw new Error(
    `${method} requires finite, non-null numeric features. Found ${invalidRows} invalid row${
      invalidRows === 1 ? "" : "s"
    }. Affected columns: ${affected.join(", ")}.`,
  );
}

async function rejectInvalidVectorRows(
  connection: SimpleTable["connection"],
  source: string,
  column: string,
  method: string,
  validation: { rejectNulls: boolean; rejectNonFinite: boolean },
) {
  const vector = quoteIdentifier(column);
  const checks: string[] = [];
  if (validation.rejectNulls) {
    checks.push(`${vector} IS NULL`);
    checks.push(
      `(${vector} IS NOT NULL AND list_count(${vector}) != len(${vector}))`,
    );
  }
  if (validation.rejectNonFinite) {
    checks.push(
      `(${vector} IS NOT NULL AND COALESCE(NOT list_bool_and(list_transform(${vector}, value -> value IS NULL OR COALESCE(isfinite(TRY_CAST(value AS DOUBLE)), FALSE))), FALSE))`,
    );
  }
  if (checks.length === 0) return;
  const invalidRows = Number(
    (await connection.runAndReadAll(
      `SELECT count(*) FROM ${source} WHERE ${checks.join(" OR ")}`,
    )).getRowsJS()[0][0],
  );
  if (invalidRows === 0) return;
  throw new Error(
    `${method} requires finite, non-null vector values. Column ${
      quoteIdentifier(column)
    } has ${invalidRows} invalid row${invalidRows === 1 ? "" : "s"}.`,
  );
}
