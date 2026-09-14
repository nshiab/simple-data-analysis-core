// Pinned benchmark-only dependency; not reachable from the package exports.
import { UMAP } from "umap-js";
import { SparseMatrix } from "umap-js/matrix";
export { SparseMatrix, UMAP };

// This adapter deliberately accesses private methods of pinned umap-js 1.4.0.
// Its public API cannot accept a weighted graph or initial coordinates. Sharing
// the exact library optimizer avoids confounding the hybrid/TS comparison with
// a second optimizer implementation. Never expose this adapter as a public API.
type Internals = {
  graph: SparseMatrix;
  random: () => number;
  nearestNeighbors: (
    vectors: number[][],
  ) => { knnIndices: number[][]; knnDistances: number[][] };
  fuzzySimplicialSet: (
    vectors: number[][],
    neighbors: number,
    mix: number,
  ) => SparseMatrix;
  initializeSimplicialSetEmbedding: () => {
    head: number[];
    tail: number[];
    epochsPerSample: number[];
  };
  initializeOptimization: () => void;
  prepareForOptimizationLoop: () => void;
  optimizationState: {
    head: number[];
    tail: number[];
    epochsPerSample: number[];
  };
};

export function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) | 0;
    let value = Math.imul(state ^ state >>> 15, 1 | state);
    value ^= value + Math.imul(value ^ value >>> 7, 61 | value);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

export function initialCoordinates(count: number, seed: number) {
  const random = seededRandom(seed);
  return Array.from(
    { length: count },
    () => [random() * 20 - 10, random() * 20 - 10],
  );
}

export function cosineDistance(a: number[], b: number[]) {
  let dot = 0, aa = 0, bb = 0;
  let identical = true;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    aa += a[i] * a[i];
    bb += b[i] * b[i];
    identical &&= a[i] === b[i];
  }
  if (aa === 0 || bb === 0) {
    throw new Error("Cosine distance requires nonzero vectors.");
  }
  return identical ? 0 : Math.max(0, 1 - dot / Math.sqrt(aa * bb));
}

export function validateVectors(vectors: number[][], metric: string) {
  if (vectors.length < 3) {
    throw new Error("At least three vectors are required.");
  }
  const dimensions = vectors[0].length;
  if (!dimensions) throw new Error("Vectors must not be empty.");
  for (const vector of vectors) {
    if (vector.length !== dimensions) {
      throw new Error("Inconsistent vector dimensions.");
    }
    let norm = 0;
    for (const value of vector) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error("Non-finite vector element.");
      }
      norm += value * value;
    }
    if (!Number.isFinite(norm) || norm > 1e300) {
      throw new Error("Vector norm overflow.");
    }
    if (metric === "cosine" && norm === 0) {
      throw new Error("Zero cosine vector.");
    }
  }
  return dimensions;
}

type Settings = {
  neighbors: number;
  epochs: number;
  seed: number;
  metric: string;
  minDistance: number;
  learningRate: number;
  negativeSamples: number;
};
export function modelFor(settings: Settings) {
  return new UMAP({
    nNeighbors: settings.neighbors,
    nEpochs: settings.epochs,
    minDist: settings.minDistance,
    learningRate: settings.learningRate,
    negativeSampleRate: settings.negativeSamples,
    random: seededRandom(settings.seed ^ 0x19e3779b),
    ...(settings.metric === "cosine" ? { distanceFn: cosineDistance } : {}),
  });
}

export function graphOf(model: UMAP) {
  return (model as unknown as Internals).graph;
}

export function initializeFromGraph(model: UMAP, graph: SparseMatrix) {
  const internal = model as unknown as Internals;
  internal.graph = graph;
  Object.assign(
    internal.optimizationState,
    internal.initializeSimplicialSetEmbedding(),
  );
  internal.initializeOptimization();
  internal.prepareForOptimizationLoop();
}

export function setInitialCoordinates(
  model: UMAP,
  initial: number[][],
  seed: number,
) {
  const embedding = model.getEmbedding();
  if (embedding.length !== initial.length) {
    throw new Error("Initial coordinate row count mismatch.");
  }
  initial.forEach((point, i) => {
    embedding[i][0] = point[0];
    embedding[i][1] = point[1];
  });
  // Reset the layout stream so neighbor-search RNG consumption cannot affect it.
  (model as unknown as Internals).random = seededRandom(seed ^ 0x7f4a7c15);
}

export function initializeFull(
  model: UMAP,
  vectors: number[][],
  record: (stage: string, ms: number) => void,
  enter: (stage: string) => unknown = () => {},
) {
  const internal = model as unknown as Internals;
  const nearest = internal.nearestNeighbors.bind(model);
  const fuzzy = internal.fuzzySimplicialSet.bind(model);
  internal.nearestNeighbors = (input) => {
    enter("neighbors");
    const start = performance.now();
    const result = nearest(input);
    record("neighbors", performance.now() - start);
    return result;
  };
  internal.fuzzySimplicialSet = (...args) => {
    enter("fuzzyGraph");
    const start = performance.now();
    const result = fuzzy(...args);
    record("fuzzyGraph", performance.now() - start);
    return result;
  };
  model.initializeFit(vectors);
}
