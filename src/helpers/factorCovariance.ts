export type CovarianceFactor = {
  dimensions: number;
  covariance: Float64Array;
  scales: Float64Array;
  cholesky: Float64Array;
  reciprocalCondition: number;
};

const instabilityMultiplier = 64;

function singularCovariance(reason: string): Error {
  return new Error(
    `Covariance is singular or numerically unstable (${reason}). Constant columns, linearly dependent features, or too few observations are common causes. Remove redundant features or provide more observations.`,
  );
}

function scaleCovarianceEntry(
  value: number,
  leftScale: number,
  rightScale: number,
): number {
  // Divide by the larger scale first. For a valid covariance, Cauchy-Schwarz
  // bounds |value| by their product, so this avoids intermediate overflow when
  // two otherwise equivalent features use radically different units.
  return leftScale >= rightScale
    ? value / leftScale / rightScale
    : value / rightScale / leftScale;
}

function solveCorrelation(
  cholesky: Float64Array,
  dimensions: number,
  rightHandSide: ArrayLike<number>,
): Float64Array {
  const solution = new Float64Array(dimensions);
  for (let row = 0; row < dimensions; row++) {
    let value = rightHandSide[row];
    for (let column = 0; column < row; column++) {
      value -= cholesky[row * dimensions + column] * solution[column];
    }
    solution[row] = value / cholesky[row * dimensions + row];
  }
  for (let row = dimensions - 1; row >= 0; row--) {
    let value = solution[row];
    for (let column = row + 1; column < dimensions; column++) {
      value -= cholesky[column * dimensions + row] * solution[column];
    }
    solution[row] = value / cholesky[row * dimensions + row];
  }
  return solution;
}

// Hager's estimator avoids forming the inverse merely to decide whether the
// correlation-scaled covariance is safe to solve. Scaling first makes this
// rank decision invariant to a change of units in any feature.
function estimateInverseOneNorm(
  cholesky: Float64Array,
  dimensions: number,
): number {
  let vector = new Float64Array(dimensions).fill(1 / dimensions);
  let estimate = 0;
  let previousIndex = -1;
  for (let iteration = 0; iteration < 8; iteration++) {
    const solved = solveCorrelation(cholesky, dimensions, vector);
    estimate = Math.max(
      estimate,
      solved.reduce((sum, value) => sum + Math.abs(value), 0),
    );
    const signs = solved.map((value) => value < 0 ? -1 : 1);
    const dual = solveCorrelation(cholesky, dimensions, signs);
    let index = 0;
    for (let i = 1; i < dimensions; i++) {
      if (Math.abs(dual[i]) > Math.abs(dual[index])) index = i;
    }
    const directional = dual.reduce(
      (sum, value, i) => sum + value * vector[i],
      0,
    );
    if (Math.abs(dual[index]) <= directional || index === previousIndex) break;
    vector = new Float64Array(dimensions);
    vector[index] = 1;
    previousIndex = index;
  }
  // The all-positive initial vector can be an eigenvector that causes Hager's
  // iteration to stop at the *smallest* inverse eigenvalue (for example an
  // equicorrelation matrix). Higham's alternating, increasing-magnitude probe
  // prevents that failure; normalize by its 1-norm to retain a lower estimate.
  // Reference: https://www.netlib.org/lapack/double/dlacon.f (final stage).
  const alternating = Float64Array.from(
    { length: dimensions },
    (_, i) => (i % 2 === 0 ? 1 : -1) * (1 + i / Math.max(1, dimensions - 1)),
  );
  const alternatingNorm = alternating.reduce(
    (sum, value) => sum + Math.abs(value),
    0,
  );
  const solved = solveCorrelation(cholesky, dimensions, alternating);
  estimate = Math.max(
    estimate,
    solved.reduce((sum, value) => sum + Math.abs(value), 0) / alternatingNorm,
  );
  return estimate;
}

/** Factors a sample covariance matrix for stable repeated linear solves. */
export function factorCovariance(
  covarianceInput: ArrayLike<number>,
  dimensions: number,
): CovarianceFactor {
  if (!Number.isSafeInteger(dimensions) || dimensions < 1) {
    throw new Error("Covariance dimensions must be a positive safe integer.");
  }
  if (covarianceInput.length !== dimensions * dimensions) {
    throw new Error(
      `Expected ${
        dimensions * dimensions
      } covariance values, received ${covarianceInput.length}.`,
    );
  }

  const covariance = Float64Array.from(covarianceInput);
  const scales = new Float64Array(dimensions);
  for (let dimension = 0; dimension < dimensions; dimension++) {
    const variance = covariance[dimension * dimensions + dimension];
    if (!Number.isFinite(variance) || variance <= 0) {
      throw singularCovariance(
        `feature ${
          dimension + 1
        } has non-positive or non-finite sample variance`,
      );
    }
    scales[dimension] = Math.sqrt(variance);
  }

  const correlation = new Float64Array(dimensions * dimensions);
  let correlationOneNorm = 0;
  for (let column = 0; column < dimensions; column++) {
    let columnSum = 0;
    for (let row = 0; row < dimensions; row++) {
      const left = covariance[row * dimensions + column];
      const right = covariance[column * dimensions + row];
      if (!Number.isFinite(left) || !Number.isFinite(right)) {
        throw singularCovariance(
          "the sample covariance contains non-finite values",
        );
      }
      const value = row === column ? 1 : scaleCovarianceEntry(
            left,
            scales[row],
            scales[column],
          ) / 2 + scaleCovarianceEntry(
            right,
            scales[row],
            scales[column],
          ) / 2;
      if (!Number.isFinite(value)) {
        throw singularCovariance(
          "correlation scaling produced a non-finite value",
        );
      }
      correlation[row * dimensions + column] = value;
      columnSum += Math.abs(value);
    }
    correlationOneNorm = Math.max(correlationOneNorm, columnSum);
  }

  const cholesky = new Float64Array(dimensions * dimensions);
  for (let row = 0; row < dimensions; row++) {
    for (let column = 0; column <= row; column++) {
      let value = correlation[row * dimensions + column];
      for (let k = 0; k < column; k++) {
        value -= cholesky[row * dimensions + k] *
          cholesky[column * dimensions + k];
      }
      if (row === column) {
        if (!Number.isFinite(value) || value <= 0) {
          throw singularCovariance(
            `correlation-scaled Cholesky pivot ${row + 1} is not positive`,
          );
        }
        cholesky[row * dimensions + column] = Math.sqrt(value);
      } else {
        cholesky[row * dimensions + column] = value /
          cholesky[column * dimensions + column];
      }
    }
  }

  const inverseOneNorm = estimateInverseOneNorm(cholesky, dimensions);
  const reciprocalCondition = 1 / (correlationOneNorm * inverseOneNorm);
  // This is the usual dimension-scaled floating-point rank tolerance, with a
  // modest safety factor for covariance aggregation and subsequent row solves.
  const tolerance = instabilityMultiplier * dimensions * Number.EPSILON;
  if (
    !Number.isFinite(reciprocalCondition) || reciprocalCondition <= tolerance
  ) {
    throw singularCovariance(
      `estimated reciprocal condition ${reciprocalCondition} is at or below ${tolerance}`,
    );
  }

  return {
    dimensions,
    covariance,
    scales,
    cholesky,
    reciprocalCondition,
  };
}

/** Solves covariance * x = rightHandSide through the scaled Cholesky factor. */
export function solveCovariance(
  factor: CovarianceFactor,
  rightHandSide: ArrayLike<number>,
): Float64Array {
  const { dimensions, scales, cholesky } = factor;
  if (rightHandSide.length !== dimensions) {
    throw new Error(
      `Expected a right-hand side with ${dimensions} values, received ${rightHandSide.length}.`,
    );
  }
  const scaled = new Float64Array(dimensions);
  for (let i = 0; i < dimensions; i++) {
    if (!Number.isFinite(rightHandSide[i])) {
      throw new Error("The covariance solve requires finite values.");
    }
    scaled[i] = rightHandSide[i] / scales[i];
  }
  const solution = solveCorrelation(cholesky, dimensions, scaled);
  for (let i = 0; i < dimensions; i++) {
    solution[i] /= scales[i];
    if (!Number.isFinite(solution[i])) {
      throw singularCovariance("the linear solve produced a non-finite value");
    }
  }
  return solution;
}

/**
 * Returns the lower-triangular transform whose squared norm is Mahalanobis
 * squared distance. This inverts only the Cholesky factor, never covariance.
 */
export function covarianceWhitening(
  factor: CovarianceFactor,
): Float64Array {
  const { dimensions, scales, cholesky } = factor;
  const whitening = new Float64Array(dimensions * dimensions);
  // Invert the triangular correlation factor first, then apply feature units.
  // Keeping units out of the recurrence avoids repeated underflow/rounding of
  // the same coefficient, and visits only the nonzero triangle.
  for (let column = 0; column < dimensions; column++) {
    for (let row = column; row < dimensions; row++) {
      let value = row === column ? 1 : 0;
      for (let k = column; k < row; k++) {
        value -= cholesky[row * dimensions + k] *
          whitening[k * dimensions + column];
      }
      whitening[row * dimensions + column] = value /
        cholesky[row * dimensions + row];
    }
    for (let row = column; row < dimensions; row++) {
      const index = row * dimensions + column;
      whitening[index] /= scales[column];
      if (!Number.isFinite(whitening[index])) {
        throw singularCovariance(
          "the whitening transform produced a non-finite value",
        );
      }
    }
  }
  return whitening;
}
