import { DuckDBInstance } from "@duckdb/node-api";
import { assert, assertAlmostEquals, assertEquals } from "@std/assert";
import buildApproximateMutualReachabilityMst, {
  repairApproximateConnectivity,
} from "../../../src/helpers/buildApproximateMutualReachabilityMst.ts";
import buildExactMutualReachabilityMst from "../../../src/helpers/buildExactMutualReachabilityMst.ts";
import buildSparseMutualReachabilityMst from "../../../src/helpers/buildSparseMutualReachabilityMst.ts";
import clusterHdbscan from "../../../src/helpers/clusterHdbscan.ts";
import vectorDistanceExpression from "../../../src/helpers/vectorDistanceExpression.ts";

type Outputs = {
  labels: ArrayLike<number>;
  probabilities: ArrayLike<number>;
  outlierScores: ArrayLike<number>;
};
const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../data/hdbscan/quality-reference.json", import.meta.url),
  ),
) as {
  cases: {
    name: string;
    vectors: number[][];
    metric: "euclidean" | "cosine";
    minSamples: number;
    minClusterSize: number;
    allowSingleCluster: boolean;
    mode: string;
  }[];
};
const names = {
  rows: "rows",
  neighbors: "neighbors",
  search: "search",
  hnsw: "hnsw",
  candidates: "candidates",
  coreDistances: "core",
  edges: "edges",
  components: "components",
  representatives: "representatives",
  componentPairs: "component_pairs",
  bridgeCandidates: "bridge_candidates",
  mst: "mst",
};
function assertOutputs(actual: Outputs, expected: Outputs) {
  const canonical = (labels: ArrayLike<number>) => {
    const ids = new Map<number, number>();
    return Array.from(labels, (label) => {
      if (label < 0) return -1;
      if (!ids.has(label)) ids.set(label, ids.size);
      return ids.get(label)!;
    });
  };
  assertEquals(canonical(actual.labels), canonical(expected.labels));
  for (const key of ["probabilities", "outlierScores"] as const) {
    for (let row = 0; row < actual[key].length; row++) {
      assertAlmostEquals(actual[key][row], expected[key][row], 1e-12);
    }
  }
}

for (const reference of fixture.cases) {
  Deno.test(`approximate HDBSCAN matches native exact on ${reference.name}`, async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      const count = reference.vectors.length;
      const dimensions = reference.vectors[0].length;
      await connection.run(`SET threads=4;
        CREATE TEMP TABLE rows AS SELECT vertex,vec::DOUBLE[${dimensions}] AS vec FROM (VALUES ${
        reference.vectors.map((vec, vertex) => `(${vertex},[${vec.join(",")}])`)
          .join(",")
      }) t(vertex,vec)`);
      await buildExactMutualReachabilityMst(
        connection,
        { count, minSamples: reference.minSamples },
        { metric: reference.metric },
        {
          rows: '"rows"',
          coreDistances: '"core"',
          frontier: '"frontier"',
          mst: '"exact_mst"',
        },
      );
      const options = {
        count,
        minClusterSize: reference.minClusterSize,
        allowSingleCluster: reference.allowSingleCluster,
      };
      const expected = await clusterHdbscan(connection, '"exact_mst"', options);
      if (reference.mode === "hnsw") {
        let previous: Outputs | undefined;
        for (let repeat = 0; repeat < 3; repeat++) {
          await buildApproximateMutualReachabilityMst(
            connection,
            { count, dimensions, minSamples: reference.minSamples },
            { metric: reference.metric },
            names,
          );
          const actual = await clusterHdbscan(connection, '"mst"', options);
          assertOutputs(actual, expected);
          if (previous) assertEquals(actual, previous);
          previous = actual;
          assertEquals(
            (await connection.runAndReadAll(
              "SELECT current_setting('threads')",
            )).getRowsJS()[0][0],
            4n,
          );
        }
      } else {
        await connection.run(
          "CREATE TEMP TABLE edges(source INTEGER,target INTEGER,distance DOUBLE)",
        );
        if (reference.mode === "forced-representative") {
          const distance = vectorDistanceExpression(
            "a.vec",
            "b.vec",
            reference.metric,
          );
          await connection.run(`INSERT INTO edges
            WITH ordered AS (SELECT vertex,lead(vertex) OVER (PARTITION BY vertex<10 ORDER BY vec[1],vertex) AS target FROM rows)
            SELECT a.vertex,b.vertex,greatest(ca.distance,cb.distance,${distance})
            FROM ordered o JOIN rows a ON a.vertex=o.vertex JOIN rows b ON b.vertex=o.target
            JOIN core ca ON ca.vertex=a.vertex JOIN core cb ON cb.vertex=b.vertex`);
        }
        const components = await repairApproximateConnectivity(
          connection,
          { count },
          { metric: reference.metric },
          names,
        );
        assertEquals(
          components,
          reference.mode === "forced-representative" ? 2 : 257,
        );
        if (reference.mode === "forced-representative") {
          const minimum = Number(
            (await connection.runAndReadAll(
              "SELECT min(distance) FROM bridge_candidates",
            )).getRowsJS()[0][0],
          );
          assertAlmostEquals(minimum, 0.1, 1e-12);
        }
        const edges = await buildSparseMutualReachabilityMst(
          connection,
          '"edges"',
          count,
        );
        assertEquals(edges.length, count - 1);
        assert(edges.every((edge) => Number.isFinite(edge.distance)));
        await connection.run(
          `CREATE TEMP TABLE mst AS SELECT * FROM (VALUES ${
            edges.map((edge) =>
              `(${edge.source},${edge.target},${edge.distance})`
            ).join(",")
          }) t(source,target,distance)`,
        );
        assertOutputs(
          await clusterHdbscan(connection, '"mst"', options),
          expected,
        );
      }
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
}
