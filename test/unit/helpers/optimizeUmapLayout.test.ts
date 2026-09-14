import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertThrows,
} from "@std/assert";
import optimizeUmapLayout from "../../../src/helpers/optimizeUmapLayout.ts";
import { initialUmapCoordinates } from "../../../src/helpers/umapRandom.ts";

// Reference Python epoch traces use fixed input coordinates and a controlled
// random stream to isolate SGD from RNG and float32 differences.
const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../data/umap/layout-reference.json", import.meta.url),
  ),
) as {
  cases: {
    minDistance: number;
    epochs: number;
    negativeSamples: number;
    seed: number;
    source: number[];
    target: number[];
    weight: number[];
    initial: number[];
    trace: number[][];
  }[];
};
for (const [index, reference] of fixture.cases.entries()) {
  Deno.test(`UMAP SGD matches Python epoch routine, trace ${index}`, () => {
    const initial = Float64Array.from(reference.initial);
    const graph = {
      source: Uint32Array.from(reference.source),
      target: Uint32Array.from(reference.target),
      weight: Float64Array.from(reference.weight),
    };
    const output = optimizeUmapLayout(graph, initial, reference);
    output.forEach((value, i) =>
      assertAlmostEquals(value, reference.trace.at(-1)![i], 2e-8)
    );
    assertEquals(Array.from(initial), reference.initial);
    assertEquals(Array.from(graph.weight), reference.weight);
  });
}
const graph = {
  source: new Uint32Array([0, 1, 1, 2]),
  target: new Uint32Array([1, 0, 2, 1]),
  weight: new Float64Array([1, 1, 0.5, 0.5]),
};
Deno.test("UMAP rejects invalid options and graphs", () => {
  const initial = initialUmapCoordinates(3, 42);
  for (
    const options of [
      { epochs: 0 },
      { epochs: 1.1 },
      { seed: 2 ** 32 },
      { seed: -1 },
      { learningRate: Infinity },
      { negativeSamples: 0 },
      { minDistance: NaN },
    ]
  ) {
    assertThrows(() => optimizeUmapLayout(graph, initial, options));
  }
  assertThrows(() => optimizeUmapLayout(graph, new Float64Array(3)));
  assertThrows(() =>
    optimizeUmapLayout(graph, new Float64Array([NaN, 0, 1, 2, 3, 4]))
  );
  for (
    const bad of [
      { ...graph, source: new Uint32Array([0]) },
      { ...graph, target: new Uint32Array([0, 0, 2, 1]) },
      { ...graph, target: new Uint32Array([9, 0, 2, 1]) },
      { ...graph, weight: new Float64Array([1, NaN, 0.5, 0.5]) },
      { ...graph, weight: new Float64Array(4) },
    ]
  ) {
    assertThrows(() => optimizeUmapLayout(bad, initial));
  }
});
Deno.test("UMAP is reproducible with a fixed seed", () => {
  const initial = initialUmapCoordinates(3, 42);
  const first = optimizeUmapLayout(graph, initial, { epochs: 20 });
  assertEquals(first, optimizeUmapLayout(graph, initial, { epochs: 20 }));
  const other = optimizeUmapLayout(graph, initial, {
    epochs: 20,
    seed: 99,
  });
  assert(first.some((value, i) => value !== other[i]));
});
