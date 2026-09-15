import { DuckDBInstance } from "@duckdb/node-api";
import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
} from "@std/assert";
import { repairApproximateConnectivity } from "../../../src/helpers/buildApproximateMutualReachabilityMst.ts";
import clusterHdbscan, {
  accumulateFloat32,
} from "../../../src/helpers/clusterHdbscan.ts";
import inspectGraphConnectivity from "../../../src/helpers/inspectGraphConnectivity.ts";

Deno.test("HDBSCAN EOM rounds every subtree stability addition to float32", () => {
  const values = [1, 4e-8, 4e-8];
  assertEquals(accumulateFloat32(values), 1);
  assertEquals(
    Math.fround(values.reduce((sum, value) => sum + value, 0)),
    1.0000001192092896,
  );
});

Deno.test("clusterHdbscan handles a 100,000-row hierarchy without argument spreading", async () => {
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
    assertEquals(result.labels.length, count);
    assertEquals(result.labels[0], 0);
    assertEquals(result.labels[count - 1], 0);
    assertEquals(result.probabilities[50_000], 1);
    assertEquals(result.outlierScores[50_000], 0);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("clusterHdbscan resolves a 20,000-row comb hierarchy in linear passes", async () => {
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
    assertEquals(result.labels.length, count);
    assert(result.probabilities.every(Number.isFinite));
    assert(result.outlierScores.every(Number.isFinite));
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("clusterHdbscan rejects null MST cells before numeric coercion", async () => {
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

Deno.test("representative repair stays bounded and exposes a missed true component edge", async () => {
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
    assertEquals(
      await repairApproximateConnectivity(
        connection,
        { count: 20 },
        { metric: "euclidean" },
        names,
      ),
      2,
    );
    const representativeIds = (await connection.runAndReadAll(
      "SELECT vertex FROM representatives ORDER BY vertex",
    )).getRowsJS().flat().map(Number);
    assert(!representativeIds.includes(4));
    assert(!representativeIds.includes(14));
    assertEquals(representativeIds.length, 16);
    const bridge = Number(
      (await connection.runAndReadAll(
        "SELECT distance FROM edges WHERE source<10 AND target>=10",
      )).getRowsJS()[0][0],
    );
    assert(bridge > 0.1);
    assertAlmostEquals(bridge, 101, 1e-12);
    assertEquals(
      await inspectGraphConnectivity(connection, '"edges"', 20),
      { componentCount: 1, sizes: [20] },
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("representative repair uses the adjacent-anchor chain beyond 256 components", async () => {
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
    assertEquals(componentCount, count);
    assertEquals(
      Number(
        (await connection.runAndReadAll("SELECT count(*) FROM component_pairs"))
          .getRowsJS()[0][0],
      ),
      count - 1,
    );
    assertEquals(
      await inspectGraphConnectivity(connection, '"edges"', count),
      { componentCount: 1, sizes: [count] },
    );
    const distances = (await connection.runAndReadAll(
      "SELECT distance FROM edges",
    )).getRowsJS().flat().map(Number);
    assert(distances.every((distance) => distance === 1));
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
