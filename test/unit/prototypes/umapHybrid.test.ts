import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
  assertThrows,
} from "@std/assert";
import { DuckDBInstance } from "@duckdb/node-api";
import fitUmapCurve from "../../../benchmarks/umap/hybrid/fitUmapCurve.ts";
import optimizeUmapLayout from "../../../benchmarks/umap/hybrid/optimizeUmapLayout.ts";
import prototypeHybridUmap from "../../../benchmarks/umap/hybrid/prototypeHybridUmap.ts";
import { initialUmapCoordinates } from "../../../benchmarks/umap/hybrid/umapRandom.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../data/umap/layout-reference.json", import.meta.url),
  ),
) as {
  curves: { minDistance: number; parameters: number[] }[];
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
for (const { minDistance, parameters } of fixture.curves) {
  Deno.test(`Hybrid UMAP curve agrees with scipy at minDistance=${minDistance}`, () => {
    const actual = fitUmapCurve(minDistance);
    actual.forEach((value, i) =>
      assertAlmostEquals(value, parameters[i], 2e-5)
    );
  });
}
for (const [index, reference] of fixture.cases.entries()) {
  Deno.test(`Hybrid UMAP SGD matches Python epoch routine, trace ${index}`, async () => {
    const initial = Float64Array.from(reference.initial);
    const graph = {
      source: Uint32Array.from(reference.source),
      target: Uint32Array.from(reference.target),
      weight: Float64Array.from(reference.weight),
    };
    const output = await optimizeUmapLayout(graph, initial, reference);
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
Deno.test("Hybrid UMAP rejects invalid options and graphs", async () => {
  const initial = initialUmapCoordinates(3, 42);
  for (const value of [-1, 1.1, NaN, Infinity]) {
    assertThrows(() => fitUmapCurve(value));
  }
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
    await assertRejects(() => optimizeUmapLayout(graph, initial, options));
  }
  await assertRejects(() => optimizeUmapLayout(graph, new Float64Array(3)));
  await assertRejects(() =>
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
    await assertRejects(() => optimizeUmapLayout(bad, initial));
  }
});
Deno.test("Hybrid UMAP is reproducible and supports timer-driven cancellation", async () => {
  const initial = initialUmapCoordinates(3, 42);
  const first = await optimizeUmapLayout(graph, initial, { epochs: 20 });
  assertEquals(first, await optimizeUmapLayout(graph, initial, { epochs: 20 }));
  const other = await optimizeUmapLayout(graph, initial, {
    epochs: 20,
    seed: 99,
  });
  assert(first.some((value, i) => value !== other[i]));
  const controller = new AbortController();
  let completed = 0;
  const timer = setTimeout(() => controller.abort(), 0);
  try {
    await assertRejects(
      () =>
        optimizeUmapLayout(graph, initial, {
          epochs: 200,
          signal: controller.signal,
          onEpoch: (epoch) => {
            completed = epoch;
          },
        }),
      DOMException,
    );
    assert(completed > 0 && completed < 200);
  } finally {
    clearTimeout(timer);
  }
});

Deno.test("Hybrid pipeline preserves stable IDs, original vectors and payload, with repeatable output", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const c = await db.connect();
  try {
    await c.run(
      "CREATE TABLE input AS SELECT * FROM (VALUES ('c',[1.,2.],'third'),('a',[1.,2.],'duplicate'),('b',[3.,4.],'second'),('d',[5.,6.],'fourth')) t(id,vector,payload)",
    );
    const before = (await c.runAndReadAll("SELECT * FROM input ORDER BY id"))
      .getRowsJS();
    await prototypeHybridUmap(c, { epochs: 20, minDistance: 0.25 });
    const first =
      (await c.runAndReadAll("SELECT * FROM umap_result ORDER BY id"))
        .getRowsJS();
    assertEquals(first.map((row) => row.slice(0, 3)), before);
    assert(
      first.every((row) => Number.isFinite(row[3]) && Number.isFinite(row[4])),
    );
    await c.run(
      "CREATE OR REPLACE TABLE input AS SELECT * FROM input ORDER BY id DESC",
    );
    await prototypeHybridUmap(c, { epochs: 20, minDistance: 0.25 });
    assertEquals(
      (await c.runAndReadAll("SELECT * FROM umap_result ORDER BY id"))
        .getRowsJS(),
      first,
    );
    assertEquals(
      (await c.runAndReadAll("SELECT * FROM input ORDER BY id")).getRowsJS(),
      before,
    );
    const controller = new AbortController();
    await assertRejects(() =>
      prototypeHybridUmap(
        c,
        { signal: controller.signal },
        undefined,
        () => controller.abort(),
      )
    );
    assertEquals(
      (await c.runAndReadAll("SELECT * FROM umap_result ORDER BY id"))
        .getRowsJS(),
      first,
    );
  } finally {
    c.closeSync();
    db.closeSync();
  }
});
