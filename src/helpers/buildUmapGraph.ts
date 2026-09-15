import type { DuckDBConnection } from "@duckdb/node-api";
import readScalarNumber from "./readScalarNumber.ts";
import buildVectorNeighbors, {
  type VectorNeighborTables,
} from "./buildVectorNeighbors.ts";

// All relation names are private, already-quoted SQL identifiers supplied by
// the owning UMAP operation. No input vectors cross the JS boundary.
export type UmapTables = Omit<VectorNeighborTables, "neighbors"> & {
  knn: string;
  scales: string;
  directed: string;
  graph: string;
};

export default async function buildUmapGraph(
  connection: DuckDBConnection,
  input: { count: number; dimensions: number; neighbors: number },
  options: { metric: "euclidean" | "cosine"; search: "exact" | "hnsw" },
  names: UmapTables,
) {
  await buildVectorNeighbors(
    connection,
    {
      count: input.count,
      dimensions: input.dimensions,
      neighborCount: input.neighbors,
    },
    { ...options, includeSelf: true },
    { ...names, neighbors: names.knn },
  );
  await buildFuzzyGraph(connection, input.neighbors, names);
  const edges = await readScalarNumber(
    connection,
    `SELECT count(*) FROM ${names.graph}`,
  );
  const source = new Uint32Array(edges),
    target = new Uint32Array(edges),
    weight = new Float64Array(edges);
  const rows = await connection.stream(
    `SELECT source,target,weight FROM ${names.graph} ORDER BY source,target`,
  );
  let edge = 0;
  while (true) {
    const chunk = await rows.fetchChunk();
    if (!chunk || chunk.rowCount === 0) break;
    chunk.visitColumnValues(
      0,
      (value, row) => source[edge + row] = Number(value),
    );
    chunk.visitColumnValues(
      1,
      (value, row) => target[edge + row] = Number(value),
    );
    chunk.visitColumnValues(
      2,
      (value, row) => weight[edge + row] = Number(value),
    );
    edge += chunk.rowCount;
  }
  if (edge !== edges) throw new Error("Graph changed during transfer.");
  return { source, target, weight };
}

async function buildFuzzyGraph(
  connection: DuckDBConnection,
  neighbors: number,
  names: UmapTables,
) {
  // Smooth-kNN with local_connectivity=1, bandwidth=1, 64 bisection steps,
  // tolerance 1e-5 and the reference's 1e-3 minimum-distance scale.
  await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.scales} AS
    SELECT source, coalesce(min(distance) FILTER(WHERE distance>0),0) AS rho,
      avg(distance) AS mean_distance, 0::DOUBLE AS lo, 'Infinity'::DOUBLE AS hi,
      1::DOUBLE AS sigma, false AS done FROM ${names.knn} GROUP BY source`);
  for (let iteration = 0; iteration < 64; iteration++) {
    await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.scales} AS
      WITH sums AS (
        SELECT s.*, (SELECT sum(CASE WHEN n.distance <= s.rho THEN 1
          ELSE exp(-(n.distance-s.rho)/s.sigma) END)
          FROM ${names.knn} n WHERE n.source=s.source AND n.target != n.source) AS mass
        FROM ${names.scales} s
      ), bounds AS (
        SELECT * EXCLUDE(lo,hi,done),
          CASE WHEN NOT done AND mass < log2(${neighbors}) THEN sigma ELSE lo END AS lo,
          CASE WHEN NOT done AND mass > log2(${neighbors}) THEN sigma ELSE hi END AS hi,
          done OR abs(mass-log2(${neighbors})) < 1e-5 AS done FROM sums
      ) SELECT source,rho,mean_distance,lo,hi,
        CASE WHEN done THEN sigma WHEN isinf(hi) THEN sigma*2 ELSE (lo+hi)/2 END AS sigma,
        done FROM bounds`);
  }
  await connection.run(`UPDATE ${names.scales} SET sigma=greatest(sigma,0.001 *
    CASE WHEN rho>0 THEN mean_distance ELSE (SELECT avg(distance) FROM ${names.knn}) END);
    CREATE OR REPLACE TEMP TABLE ${names.directed} AS
    SELECT n.source,n.target,CASE WHEN n.distance<=s.rho OR s.sigma=0 THEN 1
      ELSE exp(-(n.distance-s.rho)/s.sigma) END AS weight
    FROM ${names.knn} n JOIN ${names.scales} s USING(source) WHERE n.source != n.target;
    CREATE OR REPLACE TEMP TABLE ${names.graph} AS
    SELECT coalesce(a.source,b.target) AS source, coalesce(a.target,b.source) AS target,
      coalesce(a.weight,0)+coalesce(b.weight,0)-coalesce(a.weight*b.weight,0) AS weight
    FROM ${names.directed} a FULL OUTER JOIN ${names.directed} b
      ON a.source=b.target AND a.target=b.source`);
}
