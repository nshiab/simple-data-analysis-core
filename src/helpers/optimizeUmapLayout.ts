import type prepareUmapLayoutOptions from "./prepareUmapLayoutOptions.ts";
import umapRandom from "./umapRandom.ts";

// Internal interface. Graph entries are directed, in a stable order; the fuzzy
// union graph supplies both orientations. Coordinates are interleaved x,y.
// Inputs are borrowed read-only. State is O(edges + vertices), never O(n²).
// Implements reference Euclidean UMAP SGD: scheduled attractive edges, sampled
// repulsion, clipped gradients, symmetric attractive updates, linear decay.
// Algorithm: https://umap-learn.readthedocs.io/en/latest/how_umap_works.html
export default function optimizeUmapLayout(
  graph: { source: Uint32Array; target: Uint32Array; weight: Float64Array },
  initial: Float64Array,
  options: ReturnType<typeof prepareUmapLayoutOptions>,
): Float64Array {
  const { epochs, seed, learningRate, negativeSamples, curve: [a, b] } =
    options;
  const count = initial.length / 2;
  if (!Number.isInteger(count) || count < 3 || count > 0xffffffff) {
    throw new Error(
      "Expected interleaved coordinates for at least three vertices.",
    );
  }
  for (const value of initial) {
    if (!Number.isFinite(value)) {
      throw new Error("Initial coordinates must be finite.");
    }
  }
  const { source, target, weight } = graph;
  if (
    !weight.length || source.length !== weight.length ||
    target.length !== weight.length
  ) throw new Error("Invalid graph column lengths.");
  let maximum = 0;
  for (let edge = 0; edge < weight.length; edge++) {
    if (
      source[edge] >= count || target[edge] >= count ||
      source[edge] === target[edge]
    ) throw new Error("Graph contains an invalid vertex or self edge.");
    if (
      !Number.isFinite(weight[edge]) || weight[edge] < 0 || weight[edge] > 1
    ) throw new Error("Graph weights must be between zero and one.");
    maximum = Math.max(maximum, weight[edge]);
  }
  if (!maximum) throw new Error("Graph must contain a positive edge.");
  const period = new Float64Array(weight.length);
  const nextPositive = new Float64Array(weight.length);
  const nextNegative = new Float64Array(weight.length);
  // Reference pruning uses 500 when explicitly requesting at most ten epochs.
  const threshold = maximum / (epochs > 10 ? epochs : 500);
  for (let edge = 0; edge < weight.length; edge++) {
    period[edge] = weight[edge] > 0 && weight[edge] >= threshold
      ? epochs / ((weight[edge] / maximum) * epochs)
      : Infinity;
    nextPositive[edge] = period[edge];
    nextNegative[edge] = period[edge] / negativeSamples;
  }
  const coordinates = initial.slice();
  const random = umapRandom(seed ^ 0x7f4a7c15);
  const clip = (gradient: number) => Math.max(-4, Math.min(4, gradient));
  let alpha = learningRate;
  for (let epoch = 0; epoch < epochs; epoch++) {
    for (let edge = 0; edge < weight.length; edge++) {
      if (nextPositive[edge] > epoch) continue;
      const u = source[edge] * 2, v = target[edge] * 2;
      let dx = coordinates[u] - coordinates[v],
        dy = coordinates[u + 1] - coordinates[v + 1];
      let squared = dx * dx + dy * dy;
      if (squared > 0) {
        const attraction = -2 * a * b * Math.pow(squared, b - 1) /
          (1 + a * Math.pow(squared, b));
        const gx = clip(attraction * dx) * alpha,
          gy = clip(attraction * dy) * alpha;
        coordinates[u] += gx;
        coordinates[u + 1] += gy;
        coordinates[v] -= gx;
        coordinates[v + 1] -= gy;
      }
      nextPositive[edge] += period[edge];
      const negativePeriod = period[edge] / negativeSamples;
      const draws = Math.floor((epoch - nextNegative[edge]) / negativePeriod);
      for (let draw = 0; draw < draws; draw++) {
        const other = Math.floor(random() * count) * 2;
        dx = coordinates[u] - coordinates[other];
        dy = coordinates[u + 1] - coordinates[other + 1];
        squared = dx * dx + dy * dy;
        // Coincident points get zero repulsive gradient, as in current Python
        // UMAP; this intentionally differs from UMAP-JS's constant +4 fallback.
        if (squared > 0) {
          const repulsion = 2 * b /
            ((0.001 + squared) * (1 + a * Math.pow(squared, b)));
          coordinates[u] += clip(repulsion * dx) * alpha;
          coordinates[u + 1] += clip(repulsion * dy) * alpha;
        }
      }
      nextNegative[edge] += draws * negativePeriod;
    }
    alpha = learningRate * (1 - epoch / epochs);
  }
  for (const value of coordinates) {
    if (!Number.isFinite(value)) {
      throw new Error("UMAP optimization produced a non-finite coordinate.");
    }
  }
  return coordinates;
}
