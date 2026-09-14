import { assertEquals, assertThrows } from "@std/assert";
import {
  cosineDistance,
  graphOf,
  initialCoordinates,
  initializeFromGraph,
  modelFor,
  setInitialCoordinates,
  validateVectors,
} from "../../../benchmarks/umap/compare/library.ts";

Deno.test("UMAP graph adapter reproduces the library's public fit optimizer", () => {
  const vectors = Array.from(
    { length: 40 },
    (_, i) => [Math.sin(i), Math.cos(i), i / 10],
  );
  const original = structuredClone(vectors);
  const settings = {
    neighbors: 5,
    epochs: 30,
    seed: 42,
    metric: "euclidean",
    minDistance: 0.1,
    learningRate: 1,
    negativeSamples: 5,
  };
  const full = modelFor(settings);
  full.initializeFit(vectors);
  const hybrid = modelFor(settings);
  initializeFromGraph(hybrid, graphOf(full));
  const initial = initialCoordinates(vectors.length, settings.seed);
  setInitialCoordinates(full, initial, settings.seed);
  setInitialCoordinates(hybrid, initial, settings.seed);
  for (let i = 0; i < settings.epochs; i++) {
    assertEquals(full.step(), i + 1);
    assertEquals(hybrid.step(), i + 1);
  }
  assertEquals(full.getEmbedding(), hybrid.getEmbedding());
  assertEquals(vectors, original);
  assertEquals(initial, initialCoordinates(vectors.length, settings.seed));
});

Deno.test("TypeScript comparison validates vectors before numerical work", () => {
  assertEquals(validateVectors([[1, 2], [2, 3], [3, 4]], "cosine"), 2);
  for (
    const vectors of [
      [],
      [[1], [2]],
      [[], [], []],
      [[1], [2, 3], [4]],
      [[NaN], [1], [2]],
      [[Infinity], [1], [2]],
      [[1e200], [1], [2]],
    ]
  ) {
    assertThrows(() => validateVectors(vectors, "euclidean"));
  }
  assertThrows(() => validateVectors([[0], [1], [2]], "cosine"));
  assertEquals(cosineDistance([0.1, 0.2, 0.3], [0.1, 0.2, 0.3]), 0);
  assertEquals(cosineDistance([1, 0], [0, 1]), 1);
  assertEquals(cosineDistance([1, 0], [-1, 0]), 2);
  assertThrows(() => cosineDistance([0, 0], [1, 0]));
});
