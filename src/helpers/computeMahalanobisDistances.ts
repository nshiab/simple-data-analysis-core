import { ARRAY, DOUBLE, type DuckDBConnection } from "@duckdb/node-api";
import type { CovarianceModel } from "./computeCovariance.ts";
import { covarianceWhitening } from "./factorCovariance.ts";
import quoteIdentifier from "./quoteIdentifier.ts";

/** Evaluates bulk distances in DuckDB; the caller owns the returned scratch table. */
export default async function computeMahalanobisDistances(
  connection: DuckDBConnection,
  input: {
    relation: string;
    rowIdColumn: string;
    vectorColumn: string;
  },
  model: CovarianceModel,
  referencePoint?: number[],
): Promise<{
  relation: string;
  rowIdColumn: string;
  distanceColumn: string;
  cleanup: () => Promise<void>;
}> {
  const { dimensions, means, origins, meanOffsets } = model;
  if (
    [means, origins, meanOffsets].some((values) => values.length !== dimensions)
  ) {
    throw new Error("The covariance centroid has the wrong dimensions.");
  }
  const vectorLiteral = (values: Float64Array) => {
    if (values.some((value) => !Number.isFinite(value))) {
      throw new Error("Mahalanobis centering requires finite coefficients.");
    }
    return `[${values.join(",")}]::DOUBLE[${dimensions}]`;
  };
  const originSql = vectorLiteral(origins);
  const offsetSql = vectorLiteral(meanOffsets);
  if (
    referencePoint !== undefined &&
    (referencePoint.length !== dimensions ||
      referencePoint.some((value) => !Number.isFinite(value)))
  ) {
    throw new Error(
      "Mahalanobis reference point must contain one finite number per dimension.",
    );
  }
  // Direct subtraction retains exact matches and tiny reference offsets that
  // would be lost by subtracting the centroid from both points separately.
  const centeredValue = referencePoint === undefined
    ? `(value - array_extract(${originSql}, dimension)) - array_extract(${offsetSql}, dimension)`
    : `value - array_extract(${
      vectorLiteral(Float64Array.from(referencePoint))
    }, dimension)`;
  const whitening = covarianceWhitening(model);
  const suffix = crypto.randomUUID().replaceAll("-", "");
  const relation = `__sda_mahalanobis_distances_${suffix}`;
  const weights = `__sda_mahalanobis_weights_${suffix}`;
  const rowIdColumn = "row_id";
  const distanceColumn = "distance";
  const cleanup = async () => {
    await connection.run(`DROP TABLE IF EXISTS ${quoteIdentifier(relation)}`);
  };
  try {
    await connection.run(`CREATE TEMP TABLE ${quoteIdentifier(weights)}
      (weight DOUBLE[${dimensions}])`);
    const appender = await connection.createAppender(weights);
    try {
      // Only O(d²) summary state crosses this boundary, one O(d) row at a time.
      // Binding a native table avoids parsing a matrix-sized SQL literal and
      // repeatedly evaluating it inside a per-observation lambda.
      for (let row = 0; row < dimensions; row++) {
        appender.appendArray(
          Array.from(
            whitening.subarray(row * dimensions, (row + 1) * dimensions),
          ),
          ARRAY(DOUBLE, dimensions),
        );
        appender.endRow();
      }
      appender.flushSync();
    } finally {
      appender.closeSync();
    }
    // Center once per observation. The cross product is consumed by a grouped
    // aggregate: O(n d²) arithmetic, O(n d) centered storage, O(d²) coefficients,
    // and O(n) aggregate/output state. Source vectors never enter JavaScript.
    await connection.run(`CREATE TEMP TABLE ${quoteIdentifier(relation)} AS
      WITH centered AS MATERIALIZED (
        SELECT ${quoteIdentifier(input.rowIdColumn)} AS row_id,
          list_transform(${quoteIdentifier(input.vectorColumn)},
            (value, dimension) -> ${centeredValue})::DOUBLE[${dimensions}] AS vector
        FROM ${quoteIdentifier(input.relation)}
      ), components AS MATERIALIZED (
        SELECT row_id, abs(array_inner_product(weight, vector)) AS component
        FROM centered CROSS JOIN ${quoteIdentifier(weights)}
      ), magnitudes AS (
        SELECT row_id, max(component) AS magnitude FROM components GROUP BY row_id
      )
      SELECT row_id, CASE WHEN magnitude = 0 THEN 0::DOUBLE
        ELSE magnitude * sqrt(sum(pow(component / magnitude, 2))) END AS distance
      FROM components JOIN magnitudes USING (row_id)
      GROUP BY row_id, magnitude`);
    const invalid = Number(
      (await connection.runAndReadAll(
        `SELECT count(*) FROM ${quoteIdentifier(relation)}
        WHERE distance IS NULL OR NOT isfinite(distance)`,
      )).getRowsJS()[0][0],
    );
    if (invalid > 0) {
      throw new Error(
        `Mahalanobis distance produced ${invalid} non-finite results. Rescale features or remove numerically unstable dimensions.`,
      );
    }
    return { relation, rowIdColumn, distanceColumn, cleanup };
  } catch (error) {
    await cleanup();
    throw error;
  } finally {
    await connection.run(`DROP TABLE IF EXISTS ${quoteIdentifier(weights)}`);
  }
}
