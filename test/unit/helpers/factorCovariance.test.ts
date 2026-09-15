import { assertAlmostEquals, assertEquals, assertThrows } from "@std/assert";
import {
  covarianceWhitening,
  factorCovariance,
  solveCovariance,
} from "../../../src/helpers/factorCovariance.ts";

function multiply(matrix: ArrayLike<number>, vector: ArrayLike<number>) {
  const dimensions = vector.length;
  return Array.from({ length: dimensions }, (_, row) => {
    let sum = 0;
    for (let column = 0; column < dimensions; column++) {
      sum += matrix[row * dimensions + column] * vector[column];
    }
    return sum;
  });
}

Deno.test("covariance factor solves a differently scaled system", () => {
  const covariance = new Float64Array([
    4e-24,
    1.2,
    1.2,
    9e24,
  ]);
  const factor = factorCovariance(covariance, 2);
  const solution = solveCovariance(factor, [2e-12, -3e12]);
  const product = multiply(covariance, solution);
  assertAlmostEquals(product[0], 2e-12, 1e-24);
  assertAlmostEquals(product[1], -3e12, 1);

  const unscaled = factorCovariance([4, 1.2, 1.2, 9], 2);
  assertAlmostEquals(
    factor.reciprocalCondition,
    unscaled.reciprocalCondition,
    1e-15,
  );
});

Deno.test("correlation scaling avoids overflow across extreme finite units", () => {
  const covariance = [1e-300, 0.25, 0.25, 1e300];
  const factor = factorCovariance(covariance, 2);
  const ordinary = factorCovariance([1, 0.25, 0.25, 1], 2);
  assertAlmostEquals(
    factor.reciprocalCondition,
    ordinary.reciprocalCondition,
    1e-15,
  );
  const solution = solveCovariance(factor, [1e-150, 1e150]);
  const product = multiply(covariance, solution);
  assertAlmostEquals(product[0] / 1e-150, 1, 1e-14);
  assertAlmostEquals(product[1] / 1e150, 1, 1e-14);
});

Deno.test("covariance whitening matches triangular solves", () => {
  const factor = factorCovariance([4, 1.2, 1.2, 9], 2);
  const whitening = covarianceWhitening(factor);
  const delta = [2, -3];
  const transformed = multiply(whitening, delta);
  const solved = solveCovariance(factor, delta);
  const squaredFromWhitening = transformed.reduce(
    (sum, value) => sum + value * value,
    0,
  );
  const squaredFromSolve = delta.reduce(
    (sum, value, i) => sum + value * solved[i],
    0,
  );
  assertAlmostEquals(squaredFromWhitening, squaredFromSolve, 1e-14);
});

Deno.test("covariance factor accepts difficult solvable matrices", () => {
  const correlation = 1 - 1e-10;
  const factor = factorCovariance(
    [1, correlation, correlation, 1],
    2,
  );
  const solution = solveCovariance(factor, [1, -1]);
  const product = multiply(factor.covariance, solution);
  assertAlmostEquals(product[0], 1, 1e-6);
  assertAlmostEquals(product[1], -1, 1e-6);
});

Deno.test("covariance factor rejects constant, dependent, and unstable dimensions", () => {
  for (
    const covariance of [
      [1, 0, 0, 0],
      [1, 1, 1, 1],
      [1, 1 - 1e-15, 1 - 1e-15, 1],
    ]
  ) {
    const error = assertThrows(
      () => factorCovariance(covariance, 2),
      Error,
    );
    assertEquals(
      error.message.includes("singular or numerically unstable"),
      true,
    );
    assertEquals(error.message.includes("linearly dependent"), true);
  }
});

Deno.test("covariance solve validates matrix and vector dimensions", () => {
  assertThrows(() => factorCovariance([1], 0));
  assertThrows(() => factorCovariance([1], 2));
  const factor = factorCovariance([1], 1);
  assertThrows(() => solveCovariance(factor, []));
  assertThrows(() => solveCovariance(factor, [Infinity]));
});

Deno.test("whitening remains equivalent to solves under extreme feature units", () => {
  const factor = factorCovariance([1e-300, 0.25, 0.25, 1e300], 2);
  const delta = [1e-150, 1e150];
  const transformed = multiply(covarianceWhitening(factor), delta);
  // For correlation 1/4 and equal standardized deviations, d² = 2/(1+1/4).
  assertAlmostEquals(
    transformed.reduce((sum, value) => sum + value * value, 0),
    1.6,
    1e-14,
  );
});

Deno.test("instability decisions are unchanged by feature units", () => {
  for (const scale of [1e-150, 1, 1e150]) {
    const correlation = 1 - 1e-15;
    assertThrows(
      () =>
        factorCovariance([
          scale * scale,
          correlation,
          correlation,
          1 / scale / scale,
        ], 2),
      Error,
      "numerically unstable",
    );
  }
  for (const covariance of [[1, NaN, NaN, 1], [Infinity, 0, 0, 1]]) {
    assertThrows(() => factorCovariance(covariance, 2), Error, "non-finite");
  }
});

Deno.test("condition estimator checks beyond the initial positive eigenvector", () => {
  // Exact inverse 1-norm is 1/(1-r); correlation 1-norm is 1+r.
  const factor = factorCovariance([1, 0.6, 0.6, 1], 2);
  assertAlmostEquals(factor.reciprocalCondition, 0.25, 1e-14);
});
