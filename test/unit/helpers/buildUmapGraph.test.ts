import { test, expect } from "vite-plus/test";
import { assertAlmostEquals } from "../../helpers/assertions.ts";
import { readFile as nodeReadFile } from "node:fs/promises";
import { DuckDBInstance } from "@duckdb/node-api";

import buildUmapGraph from "../../../src/helpers/buildUmapGraph.ts";

const fixture = JSON.parse(
  await nodeReadFile(new URL("../../data/umap/reference.json", import.meta.url), "utf8"),
) as {
  cases: {
    metric: "euclidean" | "cosine";
    neighbors: number;
    vectors: number[][];
    rho: number[];
    sigma: number[];
    edges: { source: number; target: number; weight: number }[];
  }[];
};
for (const reference of fixture.cases) {
  for (const search of ["exact", "hnsw"] as const) {
    test(`UMAP ${reference.metric}/${search} graph agrees with Python UMAP, including duplicates`, async () => {
      const db = await DuckDBInstance.create(":memory:");
      const c = await db.connect();
      try {
        await c.run(
          `SET threads=1; CREATE TEMP TABLE vectors AS SELECT vertex,vec::DOUBLE[${
            reference.vectors[0].length
          }] AS vec
        FROM (VALUES ${reference.vectors
          .map((v, i) => `(${i},[${v.join(",")}])`)
          .join(",")}) t(vertex,vec)`,
        );
        const graph = await buildUmapGraph(
          c,
          {
            count: reference.vectors.length,
            dimensions: reference.vectors[0].length,
            neighbors: reference.neighbors,
          },
          { metric: reference.metric, search },
          {
            rows: '"vectors"',
            knn: '"knn"',
            search: '"search"',
            hnsw: '"hnsw"',
            candidates: '"candidates"',
            scales: '"scales"',
            directed: '"directed"',
            graph: '"graph"',
          },
        );
        const expected = reference.edges.toSorted(
          (a, b) => a.source - b.source || a.target - b.target,
        );
        expect(graph.source.length).toStrictEqual(expected.length);
        expected.forEach((edge, i) => {
          expect(graph.source[i]).toStrictEqual(edge.source);
          expect(graph.target[i]).toStrictEqual(edge.target);
          assertAlmostEquals(graph.weight[i], edge.weight, 2e-5);
        });
        const scales = (
          await c.runAndReadAll("SELECT rho,sigma FROM scales ORDER BY source")
        ).getRowsJS();
        scales.forEach((row, i) => {
          assertAlmostEquals(Number(row[0]), reference.rho[i], 2e-6);
          assertAlmostEquals(Number(row[1]), reference.sigma[i], 2e-5);
        });
      } finally {
        c.closeSync();
        db.closeSync();
      }
    });
  }
}
