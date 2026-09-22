import { DuckDBInstance } from "@duckdb/node-api";
import { assert } from "@std/assert";
import buildApproximateMutualReachabilityMst, {
  repairApproximateConnectivity,
} from "../../src/helpers/buildApproximateMutualReachabilityMst.ts";
import buildSparseMutualReachabilityMst from "../../src/helpers/buildSparseMutualReachabilityMst.ts";
import buildExactMutualReachabilityMst from "../../src/helpers/buildExactMutualReachabilityMst.ts";
import clusterHdbscan from "../../src/helpers/clusterHdbscan.ts";
import vectorDistanceExpression from "../../src/helpers/vectorDistanceExpression.ts";

type Outputs = {
  labels: number[];
  probabilities: number[];
  outlierScores: number[];
};
type Case = Outputs & {
  name: string;
  vectors: number[][];
  metric: "euclidean" | "cosine";
  minSamples: number;
  minClusterSize: number;
  allowSingleCluster: boolean;
  mode: string;
  coreDistances: number[];
  synthetic?: boolean;
};
const fixturePath = new URL(
  "../../test/data/hdbscan/quality-reference.json",
  import.meta.url,
);
const fixtureText = await Deno.readTextFile(fixturePath);
const fixture = JSON.parse(fixtureText) as {
  packages: Record<string, string>;
  cases: Case[];
};
const digest = async (value: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
  ].map((b) => b.toString(16).padStart(2, "0")).join("");
function compare(actual: Outputs, expected: Outputs) {
  const count = actual.labels.length;
  const scoreError = (a: number[], b: number[]) => {
    const errors = a.map((value, i) => Math.abs(value - b[i]));
    return {
      max: Math.max(...errors),
      mean: errors.reduce((a, b) => a + b, 0) / count,
    };
  };
  let disagreements = 0;
  const changed = new Set<number>();
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const a = actual.labels[i] >= 0 && actual.labels[i] === actual.labels[j];
      const b = expected.labels[i] >= 0 &&
        expected.labels[i] === expected.labels[j];
      if (a !== b) {
        disagreements++;
        changed.add(i);
        changed.add(j);
      }
    }
  }
  const clusters = (labels: number[]) =>
    new Set(labels.filter((label) => label >= 0)).size;
  return {
    clusters: {
      actual: clusters(actual.labels),
      reference: clusters(expected.labels),
    },
    noise: {
      actual: actual.labels.filter((x) => x < 0).length,
      reference: expected.labels.filter((x) => x < 0).length,
      changedRows:
        actual.labels.filter((x, i) => (x < 0) !== (expected.labels[i] < 0))
          .length,
    },
    coMembership: {
      disagreeingPairs: disagreements,
      totalPairs: count * (count - 1) / 2,
      changedRows: changed.size,
    },
    membershipError: scoreError(actual.probabilities, expected.probabilities),
    gloshError: scoreError(actual.outlierScores, expected.outlierScores),
  };
}
const canonicalLabels = (labels: number[]) => {
  const mapping = new Map<number, number>();
  return labels.map((label) => {
    if (label < 0) return -1;
    if (!mapping.has(label)) mapping.set(label, mapping.size);
    return mapping.get(label)!;
  });
};
const benchmarkSubsets = Deno.args.includes("--benchmark-subsets");
const cases: Case[] = benchmarkSubsets
  ? ([{ dimensions: 4, metric: "euclidean" }, {
    dimensions: 128,
    metric: "cosine",
  }, { dimensions: 128, metric: "euclidean" }] as const).map((
    { dimensions, metric },
  ) => ({
    name: `benchmark-subset-${dimensions}d-${metric}`,
    synthetic: true,
    vectors: Array.from({ length: 2048 }, (_, row) => {
      const i = Math.floor(row * 100000 / 2048);
      return Array.from(
        { length: dimensions },
        (_, j) =>
          2 + Math.sin(((i % 8) + 1) * (j + 1) * 0.17320508075688773) +
          Math.cos(((i % 8) + 3) * (j + 2) * 0.10101525445522107) +
          0.01 * Math.sin((i + 1) * (j + 1) * 0.000123),
      );
    }),
    metric,
    minSamples: 15,
    minClusterSize: 25,
    allowSingleCluster: true,
    mode: "hnsw",
    labels: [],
    probabilities: [],
    outlierScores: [],
    coreDistances: [],
  }))
  : fixture.cases;
const allResults: unknown[] = [];
let duckdbVersion = "";
for (const reference of cases) {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run("SET threads=1");
    duckdbVersion = String(
      (await connection.runAndReadAll("SELECT version()")).getRowsJS()[0][0],
    );
    const count = reference.vectors.length,
      dimensions = reference.vectors[0].length;
    await connection.run(
      `CREATE TEMP TABLE rows AS SELECT vertex,vec::DOUBLE[${dimensions}] AS vec FROM (VALUES ${
        reference.vectors.map((v, i) => `(${i},[${v.join(",")}])`).join(",")
      }) t(vertex,vec)`,
    );
    const cluster = async (mst: string): Promise<Outputs> => {
      const r = await clusterHdbscan(connection, mst, {
        count,
        minClusterSize: reference.minClusterSize,
        allowSingleCluster: reference.allowSingleCluster,
      });
      return {
        labels: Array.from(r.labels),
        probabilities: Array.from(r.probabilities),
        outlierScores: Array.from(r.outlierScores),
      };
    };
    await buildExactMutualReachabilityMst(
      connection,
      { count, minSamples: reference.minSamples },
      { metric: reference.metric },
      {
        rows: '"rows"',
        coreDistances: '"exact_core"',
        frontier: '"frontier"',
        mst: '"exact_mst"',
      },
    );
    const exact = await cluster('"exact_mst"');
    const exactComparison = reference.synthetic
      ? undefined
      : compare(exact, reference);
    const repetitions: unknown[] = [];
    let previous: Outputs | undefined;
    for (
      let repeat = 0;
      repeat < (reference.mode === "hnsw" ? 5 : 1);
      repeat++
    ) {
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
      const started = performance.now();
      let metadata: Record<string, unknown>;
      let result: Outputs;
      if (reference.mode === "hnsw") {
        const stats = await buildApproximateMutualReachabilityMst(
          connection,
          { count, dimensions, minSamples: reference.minSamples },
          { metric: reference.metric },
          names,
        );
        result = await cluster('"mst"');
        metadata = {
          ...stats,
          coreDistanceError: (await connection.runAndReadAll(
            "SELECT max(abs(a.distance-b.distance)),avg(abs(a.distance-b.distance)) FROM core a JOIN exact_core b USING(vertex)",
          )).getRowsJS()[0].map(Number),
          mstWeight: {
            approximate: Number(
              (await connection.runAndReadAll(
                "SELECT fsum(distance ORDER BY source,target) FROM mst",
              )).getRowsJS()[0][0],
            ),
            exact: Number(
              (await connection.runAndReadAll(
                "SELECT fsum(distance ORDER BY source,target) FROM exact_mst",
              )).getRowsJS()[0][0],
            ),
          },
          candidateBudgetFraction: stats.neighborCount / (count - 1),
          finalEdges: Number(
            (await connection.runAndReadAll("SELECT count(*) FROM edges"))
              .getRowsJS()[0][0],
          ),
          mstHash: String(
            (await connection.runAndReadAll(
              "SELECT bit_xor(hash(source,target,distance)) FROM mst",
            )).getRowsJS()[0][0],
          ),
        };
      } else {
        await connection.run(
          "CREATE OR REPLACE TEMP TABLE core AS SELECT * FROM exact_core; CREATE OR REPLACE TEMP TABLE edges(source INTEGER,target INTEGER,distance DOUBLE)",
        );
        const distance = vectorDistanceExpression(
          "a.vec",
          "b.vec",
          reference.metric,
        );
        let optimalCandidate: Outputs | undefined;
        let minimumCrossEdge: number | undefined;
        if (reference.mode === "forced-representative") {
          await connection.run(`INSERT INTO edges
            WITH ordered AS (SELECT vertex,lead(vertex) OVER (PARTITION BY vertex<10 ORDER BY vec[1],vertex) AS target FROM rows)
            SELECT a.vertex,b.vertex,greatest(ca.distance,cb.distance,${distance})
            FROM ordered o JOIN rows a ON a.vertex=o.vertex JOIN rows b ON b.vertex=o.target
            JOIN core ca ON ca.vertex=a.vertex JOIN core cb ON cb.vertex=b.vertex;
            CREATE TEMP TABLE minimum_cross AS SELECT a.vertex AS source,b.vertex AS target,
              greatest(ca.distance,cb.distance,${distance}) AS distance
            FROM rows a CROSS JOIN rows b JOIN core ca ON ca.vertex=a.vertex JOIN core cb ON cb.vertex=b.vertex
            WHERE a.vertex<10 AND b.vertex>=10 ORDER BY distance,source,target LIMIT 1;
            CREATE TEMP TABLE optimal_candidate AS SELECT * FROM edges UNION ALL SELECT * FROM minimum_cross`);
          minimumCrossEdge = Number(
            (await connection.runAndReadAll(
              "SELECT distance FROM minimum_cross",
            )).getRowsJS()[0][0],
          );
          optimalCandidate = await cluster('"optimal_candidate"');
        }
        const before = await repairApproximateConnectivity(
          connection,
          { count },
          { metric: reference.metric },
          names,
        );
        const repairedMst = await buildSparseMutualReachabilityMst(
          connection,
          '"edges"',
          count,
        );
        await connection.run(
          `CREATE OR REPLACE TEMP TABLE mst AS SELECT * FROM (VALUES ${
            repairedMst.map((edge) =>
              `(${edge.source},${edge.target},${edge.distance})`
            ).join(",")
          }) t(source,target,distance)`,
        );
        result = await cluster('"mst"');
        metadata = {
          forcedCandidateComponents: before,
          coreDistances: "exact native core distances",
          neighborRetrieval: "none: controlled repair-only sensitivity probe",
          minimumCrossEdge,
          selectedBridgeDistances: (await connection.runAndReadAll(
            "SELECT distance FROM mst WHERE (source,target) IN (SELECT source,target FROM bridge_candidates) ORDER BY distance,source,target",
          )).getRowsJS().map((row) => Number(row[0])),
          ...(optimalCandidate
            ? {
              versusUnrestrictedCrossBridge: compare(result, optimalCandidate),
              unrestrictedCrossBridgeVersusPython: compare(
                optimalCandidate,
                reference,
              ),
            }
            : {}),
        };
      }
      assert(
        result.probabilities.every(Number.isFinite) &&
          result.outlierScores.every(Number.isFinite),
      );
      repetitions.push({
        repeat,
        elapsedMs: performance.now() - started,
        ...metadata,
        ...(reference.synthetic
          ? {}
          : { versusPython: compare(result, reference) }),
        versusNativeExact: compare(result, exact),
        ...(previous ? { versusPrevious: compare(result, previous) } : {}),
        partitionHash: await digest(
          JSON.stringify(canonicalLabels(result.labels)),
        ),
        scoreHash: await digest(
          JSON.stringify([result.probabilities, result.outlierScores]),
        ),
      });
      previous = result;
    }
    allResults.push({
      name: reference.name,
      rows: count,
      dimensions,
      metric: reference.metric,
      minSamples: reference.minSamples,
      minClusterSize: reference.minClusterSize,
      allowSingleCluster: reference.allowSingleCluster,
      mode: reference.mode,
      exactNativeVersusPython: exactComparison,
      exactNativeOutputs: Deno.args.includes("--summary") ? undefined : exact,
      exactNativeMst: Deno.args.includes("--summary")
        ? undefined
        : (await connection.runAndReadAll("SELECT * FROM exact_mst"))
          .getRowsJS()
          .map((row) => row.map(Number)),
      repetitions,
    });
  } finally {
    connection.closeSync();
    db.closeSync();
  }
}
const sourceHashes = Object.fromEntries(
  await Promise.all(
    [
      "buildApproximateMutualReachabilityMst",
      "buildExactMutualReachabilityMst",
      "clusterHdbscan",
      "buildVectorNeighbors",
      "buildSparseMutualReachabilityMst",
      "stabilizeCosineVectors",
      "vectorDistanceExpression",
    ].map(
      async (name) => [
        name,
        await digest(
          await Deno.readTextFile(
            new URL(`../../src/helpers/${name}.ts`, import.meta.url),
          ),
        ),
      ],
    ),
  ),
);
console.log(JSON.stringify(
  {
    measuredAt: new Date().toISOString(),
    scope:
      "moderate graph/hierarchy quality, not end-to-end performance or a resource-bound claim",
    software: {
      deno: Deno.version.deno,
      duckdb: duckdbVersion,
      threads: 1,
      referencePackages: fixture.packages,
    },
    dataset: benchmarkSubsets
      ? "2048 evenly spaced source ids from each 100000-row deterministic benchmark formula; generated in JS DOUBLE"
      : "pinned Python quality fixtures",
    fixtureSha256: benchmarkSubsets ? undefined : await digest(fixtureText),
    sourceHashes,
    cases: allResults,
  },
  null,
  2,
));
