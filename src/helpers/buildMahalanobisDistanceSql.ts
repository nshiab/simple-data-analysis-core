import type { CovarianceModel } from "./computeCovariance.ts";
import { covarianceWhitening } from "./factorCovariance.ts";

function sqlNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error("Mahalanobis SQL coefficients must be finite.");
  }
  return Object.is(value, -0) ? "0" : String(value);
}

function sqlVector(values: ArrayLike<number>): string {
  return `[${Array.from(values, sqlNumber).join(",")}]`;
}

/** Builds a DuckDB expression that evaluates all source vectors in place. */
export default function buildMahalanobisDistanceSql(
  vectorExpression: string,
  model: CovarianceModel,
): string {
  const { dimensions, means, origins, meanOffsets } = model;
  if (
    means.length !== dimensions || origins.length !== dimensions ||
    meanOffsets.length !== dimensions
  ) {
    throw new Error("The covariance centroid has the wrong dimensions.");
  }
  const whitening = covarianceWhitening(model);
  const rows = Array.from(
    { length: dimensions },
    (_, row) =>
      sqlVector(
        whitening.subarray(row * dimensions, (row + 1) * dimensions),
      ),
  );
  const centered = `list_transform(${vectorExpression},
    (__sda_value, __sda_index) -> (__sda_value -
      array_extract(${
    sqlVector(origins)
  }::DOUBLE[${dimensions}], __sda_index)) -
      array_extract(${
    sqlVector(meanOffsets)
  }::DOUBLE[${dimensions}], __sda_index)
  )::DOUBLE[${dimensions}]`;
  // DuckDB applies the bounded O(d²) whitening state to every row. Only the
  // centroid/covariance summaries crossed into JS; source vectors remain native.
  return `sqrt(greatest(0, list_sum(list_transform(
    [${rows.join(",")}]::DOUBLE[${dimensions}][],
    __sda_weight -> pow(array_inner_product(__sda_weight, ${centered}), 2)
  ))))`;
}
