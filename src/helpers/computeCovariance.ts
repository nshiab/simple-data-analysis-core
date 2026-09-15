import type { DuckDBConnection } from "@duckdb/node-api";
import quoteIdentifier from "./quoteIdentifier.ts";
import { type CovarianceFactor, factorCovariance } from "./factorCovariance.ts";

export type CovarianceModel = CovarianceFactor & {
  means: Float64Array;
  origins: Float64Array;
  meanOffsets: Float64Array;
  observations: number;
};

export default async function computeCovariance(
  connection: DuckDBConnection,
  input: {
    relation: string;
    rowIdColumn: string;
    vectorColumn: string;
    observations: number;
    dimensions: number;
  },
): Promise<CovarianceModel> {
  const { observations, dimensions } = input;
  if (!Number.isSafeInteger(dimensions) || dimensions < 1) {
    throw new Error("Covariance requires at least one feature dimension.");
  }
  if (!Number.isSafeInteger(observations) || observations <= dimensions) {
    throw new Error(
      `Covariance requires more observations than features (n > d), but received n=${observations} and d=${dimensions}. More observations are necessary, though constant or linearly dependent features can still make covariance singular.`,
    );
  }

  const relation = quoteIdentifier(input.relation);
  const rowId = quoteIdentifier(input.rowIdColumn);
  const vector = quoteIdentifier(input.vectorColumn);
  const expanded = `SELECT r.${rowId} AS observation,
      feature::INTEGER AS feature,
      array_extract(r.${vector}, feature)::DOUBLE AS value
    FROM ${relation} r CROSS JOIN range(1, ${dimensions + 1}) f(feature)`;
  const offsets = `SELECT observation, feature, value,
      first_value(value) OVER (PARTITION BY feature ORDER BY observation
        ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING) AS origin
    FROM (${expanded})`;

  const meanRows = (await connection.runAndReadAll(
    `SELECT feature - 1 AS feature, first(origin) AS origin,
      avg(value - origin) AS mean_offset FROM (${offsets})
      GROUP BY feature ORDER BY feature`,
  )).getRowsJS();
  if (meanRows.length !== dimensions) {
    throw new Error("Covariance aggregation returned an incomplete centroid.");
  }
  const means = new Float64Array(dimensions);
  const origins = new Float64Array(dimensions);
  const meanOffsets = new Float64Array(dimensions);
  for (const row of meanRows) {
    const feature = Number(row[0]);
    const origin = Number(row[1]);
    const meanOffset = Number(row[2]);
    if (
      !Number.isSafeInteger(feature) || !Number.isFinite(origin) ||
      !Number.isFinite(meanOffset)
    ) {
      throw new Error("Covariance aggregation returned a non-finite centroid.");
    }
    origins[feature] = origin;
    meanOffsets[feature] = meanOffset;
    means[feature] = origin + meanOffset;
  }

  const covariance = new Float64Array(dimensions * dimensions);
  // covar_samp divides centered cross-products by n - 1. Subtracting a native
  // per-feature anchor first avoids cancellation in E[x*y] - E[x]E[y] and
  // retains small deviations when a feature has a large common offset.
  const result = await connection.stream(
    `WITH features AS MATERIALIZED (
        SELECT observation, feature, value - origin AS value FROM (${offsets})
      )
      SELECT a.feature - 1 AS row, b.feature - 1 AS column,
        covar_samp(a.value, b.value) AS covariance
      FROM features a JOIN features b
        ON a.observation = b.observation AND a.feature <= b.feature
      GROUP BY a.feature, b.feature`,
  );
  let values = 0;
  while (true) {
    const chunk = await result.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    const rows = new Int32Array(chunk.rowCount);
    const columns = new Int32Array(chunk.rowCount);
    const entries = new Float64Array(chunk.rowCount);
    chunk.visitColumnValues(0, (value, row) => rows[row] = Number(value));
    chunk.visitColumnValues(1, (value, row) => columns[row] = Number(value));
    chunk.visitColumnValues(2, (value, row) => entries[row] = Number(value));
    for (let i = 0; i < chunk.rowCount; i++) {
      const row = rows[i];
      const column = columns[i];
      const value = entries[i];
      covariance[row * dimensions + column] = value;
      covariance[column * dimensions + row] = value;
      values++;
    }
  }
  if (values !== dimensions * (dimensions + 1) / 2) {
    throw new Error("Covariance aggregation returned an incomplete matrix.");
  }

  return {
    ...factorCovariance(covariance, dimensions),
    means,
    origins,
    meanOffsets,
    observations,
  };
}
