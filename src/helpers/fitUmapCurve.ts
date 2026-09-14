// Least-squares fit of 1/(1+a*x^(2*b)) to the reference UMAP target curve.
// Spread is fixed to one. See umap-learn's find_ab_params (0.5.9.post2).
// A two-parameter damped Gauss-Newton solve avoids a runtime fitting dependency.
export default function fitUmapCurve(minDistance: number): [number, number] {
  if (!Number.isFinite(minDistance) || minDistance < 0 || minDistance > 1) {
    throw new Error("minDistance must be between zero and one.");
  }
  const samples = Array.from({ length: 299 }, (_, i) => {
    const x = (i + 1) * 3 / 299;
    return {
      logX: Math.log(x),
      target: Math.exp(-Math.max(0, x - minDistance)),
    };
  });
  const loss = (logA: number, logB: number) => {
    let sum = 0;
    for (const { logX, target } of samples) {
      const residual = 1 / (1 + Math.exp(logA + 2 * Math.exp(logB) * logX)) -
        target;
      sum += residual * residual;
    }
    return sum;
  };
  let logA = 0, logB = 0, damping = 1e-3;
  let error = loss(logA, logB);
  for (let iteration = 0; iteration < 100; iteration++) {
    let aa = 0, ab = 0, bb = 0, ga = 0, gb = 0;
    for (const { logX, target } of samples) {
      const power = Math.exp(logA + 2 * Math.exp(logB) * logX);
      const predicted = 1 / (1 + power);
      const da = -power * predicted * predicted;
      const db = da * 2 * Math.exp(logB) * logX;
      aa += da * da;
      ab += da * db;
      bb += db * db;
      ga += da * (predicted - target);
      gb += db * (predicted - target);
    }
    const aDiagonal = aa + damping * Math.max(aa, 1e-12);
    const bDiagonal = bb + damping * Math.max(bb, 1e-12);
    const determinant = aDiagonal * bDiagonal - ab * ab;
    if (!(determinant > 0)) throw new Error("UMAP curve fit became singular.");
    const stepA = (ab * gb - bDiagonal * ga) / determinant;
    const stepB = (ab * ga - aDiagonal * gb) / determinant;
    const nextA = Math.max(-20, Math.min(20, logA + stepA));
    const nextB = Math.max(-20, Math.min(20, logB + stepB));
    const nextError = loss(nextA, nextB);
    if (nextError < error) {
      const improvement = error - nextError;
      logA = nextA;
      logB = nextB;
      error = nextError;
      damping = Math.max(damping / 3, 1e-12);
      if (improvement < 1e-13) return [Math.exp(logA), Math.exp(logB)];
    } else {
      damping *= 10;
      if (Math.max(Math.abs(ga), Math.abs(gb)) < 1e-7) {
        return [Math.exp(logA), Math.exp(logB)];
      }
    }
  }
  throw new Error("UMAP curve fit did not converge.");
}
