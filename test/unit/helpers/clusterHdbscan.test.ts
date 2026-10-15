import { test, expect } from "vite-plus/test";
import { ok as assert } from "node:assert/strict";
import { assertRejects, assertAlmostEquals } from "../../helpers/assertions.ts";
import { readFile as nodeReadFile } from "node:fs/promises";
import { DuckDBInstance } from "@duckdb/node-api";

import { repairApproximateConnectivity } from "../../../src/helpers/buildApproximateMutualReachabilityMst.ts";
import clusterHdbscan, { accumulateFloat32 } from "../../../src/helpers/clusterHdbscan.ts";
import inspectGraphConnectivity from "../../../src/helpers/inspectGraphConnectivity.ts";

test("HDBSCAN EOM rounds every subtree stability addition to float32", () => {
  const values = [1, 4e-8, 4e-8];
  expect(accumulateFloat32(values)).toStrictEqual(1);
  expect(Math.fround(values.reduce((sum, value) => sum + value, 0))).toStrictEqual(
    1.0000001192092896,
  );
});

test("clusterHdbscan handles a 100,000-row hierarchy without argument spreading", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    const count = 100_000;
    await connection.run(`CREATE TEMP TABLE mst AS
      SELECT i::INTEGER AS source,(i+1)::INTEGER AS target,1::DOUBLE AS distance
      FROM range(${count - 1}) rows(i)`);
    const result = await clusterHdbscan(connection, '"mst"', {
      count,
      minClusterSize: 2,
      allowSingleCluster: true,
    });
    expect(result.labels.length).toStrictEqual(count);
    expect(result.labels[0]).toStrictEqual(0);
    expect(result.labels[count - 1]).toStrictEqual(0);
    expect(result.probabilities[50_000]).toStrictEqual(1);
    expect(result.outlierScores[50_000]).toStrictEqual(0);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

test("clusterHdbscan resolves a 20,000-row comb hierarchy in linear passes", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    const count = 20_000;
    await connection.run(`CREATE TEMP TABLE mst AS
      SELECT (2*i)::INTEGER AS source,(2*i+1)::INTEGER AS target,
        1::DOUBLE AS distance FROM range(${count / 2}) rows(i)
      UNION ALL
      SELECT (2*i-1)::INTEGER,(2*i)::INTEGER,(i+1)::DOUBLE
        FROM range(1,${count / 2}) rows(i)`);
    const result = await clusterHdbscan(connection, '"mst"', {
      count,
      minClusterSize: 2,
      allowSingleCluster: false,
    });
    expect(result.labels.length).toStrictEqual(count);
    assert(result.probabilities.every(Number.isFinite));
    assert(result.outlierScores.every(Number.isFinite));
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

test("clusterHdbscan rejects null MST cells before numeric coercion", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE mst(
      source INTEGER,target INTEGER,distance DOUBLE);
      INSERT INTO mst VALUES (NULL,1,1)`);
    await assertRejects(
      () =>
        clusterHdbscan(connection, '"mst"', {
          count: 2,
          minClusterSize: 2,
          allowSingleCluster: true,
        }),
      Error,
      "contains an invalid edge",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

test("projection repair includes the true component edge missed by representative sampling", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE rows AS
      SELECT i::INTEGER AS vertex,
        [CASE
          WHEN i=4 THEN 0.0 WHEN i=14 THEN 0.1
          WHEN i<10 THEN 100.0+i ELSE 200.0+i
        END]::DOUBLE[1] AS vec
      FROM range(20) source(i);
      CREATE TEMP TABLE core_distances AS
        SELECT i::INTEGER AS vertex,0::DOUBLE AS distance FROM range(20) source(i);
      CREATE TEMP TABLE edges AS
        SELECT i::INTEGER AS source,(i+1)::INTEGER AS target,1::DOUBLE AS distance
        FROM range(9) source(i)
        UNION ALL
        SELECT i::INTEGER,(i+1)::INTEGER,1::DOUBLE FROM range(10,19) source(i)`);
    const names = {
      rows: "rows",
      coreDistances: "core_distances",
      edges: "edges",
      components: "components",
      representatives: "representatives",
      componentPairs: "component_pairs",
      bridgeCandidates: "bridge_candidates",
    };
    expect(
      await repairApproximateConnectivity(
        connection,
        { count: 20 },
        { metric: "euclidean" },
        names,
      ),
    ).toStrictEqual(2);
    const representativeIds = (
      await connection.runAndReadAll("SELECT vertex FROM representatives ORDER BY vertex")
    )
      .getRowsJS()
      .flat()
      .map(Number);
    assert(representativeIds.includes(4));
    assert(representativeIds.includes(14));
    expect(representativeIds.length).toStrictEqual(20);
    const bridge = Number(
      (
        await connection.runAndReadAll(
          "SELECT min(distance) FROM edges WHERE source<10 AND target>=10",
        )
      ).getRowsJS()[0][0],
    );
    assertAlmostEquals(bridge, 0.1, 1e-12);
    expect(await inspectGraphConnectivity(connection, '"edges"', 20)).toStrictEqual({
      componentCount: 1,
      sizes: [20],
    });
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

test("projection repair stays connected beyond 256 components", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    const count = 257;
    await connection.run(`CREATE TEMP TABLE rows AS
      SELECT i::INTEGER AS vertex,[${count}-i::DOUBLE]::DOUBLE[1] AS vec
      FROM range(${count}) source(i);
      CREATE TEMP TABLE core_distances AS
        SELECT i::INTEGER AS vertex,0::DOUBLE AS distance
        FROM range(${count}) source(i);
      CREATE TEMP TABLE edges(source INTEGER,target INTEGER,distance DOUBLE)`);
    const componentCount = await repairApproximateConnectivity(
      connection,
      { count },
      { metric: "euclidean" },
      {
        rows: "rows",
        coreDistances: "core_distances",
        edges: "edges",
        components: "components",
        representatives: "representatives",
        componentPairs: "component_pairs",
        bridgeCandidates: "bridge_candidates",
      },
    );
    expect(componentCount).toStrictEqual(count);
    expect(
      Number((await connection.runAndReadAll("SELECT count(*) FROM edges")).getRowsJS()[0][0]),
    ).toStrictEqual(count - 1);
    expect(await inspectGraphConnectivity(connection, '"edges"', count)).toStrictEqual({
      componentCount: 1,
      sizes: [count],
    });
    const distances = (await connection.runAndReadAll("SELECT distance FROM edges"))
      .getRowsJS()
      .flat()
      .map(Number);
    assert(distances.every((distance) => distance === 1));
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

test("HDBSCAN validates the full hierarchy identifier range before allocation", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await assertRejects(
      () =>
        clusterHdbscan(connection, '"unused"', {
          count: 0x40000001,
          minClusterSize: 2,
          allowSingleCluster: true,
        }),
      Error,
      "all 2*n-1 node identifiers fit signed INTEGER state",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

// Precomputed results for identical MSTs isolate deterministic tie ordering.
const tieReferences = JSON.parse(
  await nodeReadFile(
    new URL("../../data/hdbscan/quality-tie-reference.json", import.meta.url),
    "utf8",
  ),
) as {
  packages: { hdbscan: string };
  cases: {
    name: string;
    count: number;
    minClusterSize: number;
    allowSingleCluster: boolean;
    mst: number[][];
    expected: {
      labels: number[];
      probabilities: number[];
      outlierScores: number[];
    };
  }[];
};
for (const reference of tieReferences.cases) {
  test(`HDBSCAN matches Python on the same ordered tied MST: ${reference.name}`, async () => {
    expect(tieReferences.packages.hdbscan).toStrictEqual("0.8.44");
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      // SQL insertion order must not change SDA's documented endpoint tie rule.
      for (const edges of [reference.mst, reference.mst.toReversed()]) {
        await connection.run(`CREATE OR REPLACE TEMP TABLE mst AS
          SELECT source::INTEGER AS source,target::INTEGER AS target,distance::DOUBLE AS distance
          FROM (VALUES ${edges
            .map((edge) => `(${edge.join(",")})`)
            .join(",")}) t(source,target,distance)`);
        const actual = await clusterHdbscan(connection, '"mst"', reference);
        expect(Array.from(actual.labels)).toStrictEqual(reference.expected.labels);
        actual.probabilities.forEach((value, index) =>
          assertAlmostEquals(value, reference.expected.probabilities[index], 1e-12),
        );
        actual.outlierScores.forEach((value, index) =>
          assertAlmostEquals(value, reference.expected.outlierScores[index], 1e-12),
        );
      }
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
}
