import { DuckDBInstance } from "@duckdb/node-api";
import buildExactMutualReachabilityMst from "../../../src/helpers/buildExactMutualReachabilityMst.ts";
import clusterHdbscan from "../../../src/helpers/clusterHdbscan.ts";

// Generate only the native MSTs and outputs needed by quality-ties.py.
// Python independently evaluates the same ordered trees to isolate hierarchy
// correctness from distance rounding and equal-weight MST choices.
const fixture = JSON.parse(
  await Deno.readTextFile(new URL("quality-reference.json", import.meta.url)),
) as {
  cases: {
    name: string;
    mode: string;
    vectors: number[][];
    metric: "euclidean" | "cosine";
    minSamples: number;
    minClusterSize: number;
    allowSingleCluster: boolean;
  }[];
};
const cases = [];
for (
  const reference of fixture.cases.filter((entry) => entry.mode === "hnsw")
) {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    const count = reference.vectors.length;
    const dimensions = reference.vectors[0].length;
    await connection.run(`SET threads=1;
      CREATE TEMP TABLE rows AS SELECT vertex,vec::DOUBLE[${dimensions}] AS vec
      FROM (VALUES ${
      reference.vectors.map((vector, vertex) =>
        `(${vertex},[${vector.join(",")}])`
      ).join(",")
    }) t(vertex,vec)`);
    await buildExactMutualReachabilityMst(
      connection,
      { count, minSamples: reference.minSamples },
      { metric: reference.metric },
      {
        rows: '"rows"',
        coreDistances: '"core"',
        frontier: '"frontier"',
        mst: '"mst"',
      },
    );
    const result = await clusterHdbscan(connection, '"mst"', {
      count,
      minClusterSize: reference.minClusterSize,
      allowSingleCluster: reference.allowSingleCluster,
    });
    cases.push({
      name: reference.name,
      exactNativeMst: (await connection.runAndReadAll(
        "SELECT source,target,distance FROM mst ORDER BY distance,source,target",
      )).getRowsJS().map((row) => row.map(Number)),
      exactNativeOutputs: {
        labels: Array.from(result.labels),
        probabilities: Array.from(result.probabilities),
        outlierScores: Array.from(result.outlierScores),
      },
    });
  } finally {
    connection.closeSync();
    db.closeSync();
  }
}
console.log(JSON.stringify({ cases }, null, 2));
