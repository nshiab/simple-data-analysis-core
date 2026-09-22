import type SimpleTable from "../class/SimpleTable.ts";
import foldIdentifier from "../helpers/foldIdentifier.ts";
import prepareNumericFeatures from "../helpers/prepareNumericFeatures.ts";
import publishPreparedColumns from "../helpers/publishPreparedColumns.ts";
import queueOp from "../helpers/queueOp.ts";
import quoteIdentifier from "../helpers/quoteIdentifier.ts";

type Options = NonNullable<Parameters<SimpleTable["normalizeVector"]>[2]>;

export default function normalizeVector(
  table: SimpleTable,
  column: string,
  newColumn: string,
  options: Options = {},
): void {
  if (
    options.normalization !== undefined &&
    options.normalization !== "dimensionMinMax" &&
    options.normalization !== "rowL2"
  ) {
    throw new Error(
      'normalizeVector() options.normalization must be "dimensionMinMax" or "rowL2".',
    );
  }
  const settings = structuredClone(options);
  queueOp(table, {
    kind: "barrier",
    method: "normalizeVector()",
    parameters: { column, newColumn, options: settings },
    execute: () => execute(table, column, newColumn, settings),
  });
}

async function execute(
  table: SimpleTable,
  column: string,
  newColumn: string,
  options: Options,
): Promise<void> {
  const normalization = options.normalization ?? "dimensionMinMax";
  const overwrite = foldIdentifier(column) === foldIdentifier(newColumn);
  if (!overwrite) {
    const sourceColumns = Object.keys(await table.getTypes());
    if (
      sourceColumns.some((name) =>
        foldIdentifier(name) === foldIdentifier(newColumn)
      )
    ) {
      throw new Error(
        `normalizeVector() cannot create ${
          quoteIdentifier(newColumn)
        } because that column already exists. Remove it first or choose a different name.`,
      );
    }
  }
  const prepared = await prepareNumericFeatures(
    table,
    { kind: "vector", column },
    { method: "normalizeVector()" },
  );
  const connection = table.connection!;
  const q = quoteIdentifier;
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const statsName = `__sda_normalize_vector_${suffix}_stats`;
  const resultName = `__sda_normalize_vector_${suffix}_result`;
  const dimension = q(`__sda_dimension_${suffix}`);
  const minimum = q(`__sda_min_${suffix}`);
  const maximum = q(`__sda_max_${suffix}`);
  const normalized = `__sda_normalized_${suffix}`;

  try {
    if (prepared.rowCount === 0) {
      throw new Error(
        "normalizeVector() requires at least one row; the dataset is empty.",
      );
    }
    const sourceColumn = prepared.sourceColumns.find((name) =>
      foldIdentifier(name) === foldIdentifier(column)
    )!;
    if (normalization === "rowL2") {
      // Scale before squaring so extreme finite magnitudes do not overflow
      // or underflow the norm. A zero vector stays zero.
      await connection.run(
        `CREATE TEMP TABLE ${q(resultName)} AS
         WITH magnitudes AS (
           SELECT ${q(prepared.rowIdColumn)}, ${
          q(prepared.vectorColumn)
        } AS vec,
             list_max(list_transform(${
          q(prepared.vectorColumn)
        }, value -> abs(value))) AS magnitude
           FROM ${q(prepared.relation)}
         ), scaled AS (
           SELECT *, list_transform(vec, value -> value / nullif(magnitude, 0)) AS unit_scale
           FROM magnitudes
         ), norms AS (
           SELECT *, sqrt(list_sum(list_transform(unit_scale, value -> value * value))) AS norm
           FROM scaled
         )
         SELECT ${q(prepared.rowIdColumn)},
           (CASE WHEN magnitude = 0 THEN vec::DOUBLE[]
             ELSE list_transform(unit_scale, value -> value / norm)
           END)::DOUBLE[${prepared.dimensions}] AS ${q(normalized)}
         FROM norms`,
      );
    } else {
      await connection.run(
        `CREATE TEMP TABLE ${q(statsName)} AS
         SELECT ordinal::BIGINT AS ${dimension}, min(value)::DOUBLE AS ${minimum},
           max(value)::DOUBLE AS ${maximum}
         FROM ${q(prepared.relation)} p,
           UNNEST(p.${
          q(prepared.vectorColumn)
        }::DOUBLE[]) WITH ORDINALITY AS values(value, ordinal)
         GROUP BY ordinal`,
      );
      const invalidStats = Number(
        (await connection.runAndReadAll(
          `SELECT count(*) FROM ${q(statsName)}
           WHERE NOT isfinite(${minimum}) OR NOT isfinite(${maximum})`,
        )).getRowsJS()[0][0],
      );
      if (invalidStats > 0) {
        throw new Error(
          `normalizeVector() found ${invalidStats} dimension${
            invalidStats === 1 ? "" : "s"
          } with non-finite aggregate values after conversion to DOUBLE.`,
        );
      }
      const constantDimensions = (await connection.runAndReadAll(
        `SELECT ${dimension} FROM ${q(statsName)}
         WHERE ${minimum} = ${maximum} ORDER BY ${dimension}`,
      )).getRowsJS().map((row) => Number(row[0]));
      if (constantDimensions.length > 0) {
        throw new Error(
          `normalizeVector() cannot scale constant dimension${
            constantDimensions.length === 1 ? "" : "s"
          } ${constantDimensions.join(", ")} in column ${
            q(sourceColumn)
          } because the range is zero. Remove ${
            constantDimensions.length === 1
              ? "that dimension"
              : "those dimensions"
          } before normalizing. Conversion to DOUBLE can also collapse distinct large integers or decimals at its precision limit.`,
        );
      }

      const value = `p.${q(prepared.vectorColumn)}[s.${dimension}]`;
      const min = `s.${minimum}`;
      const max = `s.${maximum}`;
      // Dividing both sides by the larger magnitude when a range crosses zero
      // avoids overflowing max - min for extreme finite DOUBLE values.
      const scaled = `CASE
        WHEN ${min} < 0 AND ${max} > 0 AND -${min} >= ${max}
          THEN ((${value} / -${min}) + 1.0) / ((${max} / -${min}) + 1.0)
        WHEN ${min} < 0 AND ${max} > 0
          THEN ((${value} / ${max}) + (-${min} / ${max})) /
            (1.0 + (-${min} / ${max}))
        ELSE (${value} - ${min}) / (${max} - ${min})
      END`;
      await connection.run(
        `CREATE TEMP TABLE ${q(resultName)} AS
         SELECT p.${q(prepared.rowIdColumn)},
           list(${scaled} ORDER BY s.${dimension})::DOUBLE[${prepared.dimensions}]
             AS ${q(normalized)}
         FROM ${q(prepared.relation)} p CROSS JOIN ${q(statsName)} s
         GROUP BY p.${q(prepared.rowIdColumn)}`,
      );
    }
    const invalidResults = Number(
      (await connection.runAndReadAll(
        `SELECT count(*) FROM ${q(resultName)}
         WHERE ${q(normalized)} IS NULL
           OR list_count(${q(normalized)}) != ${prepared.dimensions}
           OR NOT list_bool_and(list_transform(${
          q(normalized)
        }, value -> isfinite(value)))
           OR list_min(${q(normalized)}) < ${normalization === "rowL2" ? -1 : 0}
           OR list_max(${q(normalized)}) > 1`,
      )).getRowsJS()[0][0],
    );
    if (invalidResults > 0) {
      throw new Error(
        `normalizeVector() produced non-finite or out-of-range values for ${invalidResults} row${
          invalidResults === 1 ? "" : "s"
        }. Rescale the source values before normalizing.`,
      );
    }

    await publishPreparedColumns(table, prepared, {
      method: "normalizeVector()",
      parameters: { column, newColumn, options },
      result: {
        relation: resultName,
        rowIdColumn: prepared.rowIdColumn,
      },
      outputs: [{
        name: overwrite ? sourceColumn : newColumn,
        expression: `r.${q(normalized)}`,
        replace: overwrite ? sourceColumn : undefined,
      }],
    });
  } finally {
    await connection.run(`DROP TABLE IF EXISTS ${q(resultName)}`);
    await connection.run(`DROP TABLE IF EXISTS ${q(statsName)}`);
    await prepared.cleanup();
  }
}
