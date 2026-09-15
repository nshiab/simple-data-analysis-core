import { DuckDBInstance } from "@duckdb/node-api";
import { assertAlmostEquals, assertEquals, assertRejects } from "@std/assert";
import inspectGraphConnectivity from "../../../src/helpers/inspectGraphConnectivity.ts";
import buildExactMutualReachabilityMst from "../../../src/helpers/buildExactMutualReachabilityMst.ts";

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../data/hdbscan/reference.json", import.meta.url),
  ),
) as {
  packages: { hdbscan: string };
  referenceSettings: {
    algorithm: string;
    approx_min_span_tree: boolean;
  };
  cases: {
    name: string;
    metric: "euclidean" | "cosine";
    minSamples: number;
    vectors: number[][];
    coreDistances: number[];
    mst: number[][];
  }[];
};

assertEquals(fixture.packages.hdbscan, "0.8.40");
assertEquals(fixture.referenceSettings.algorithm, "generic");
assertEquals(fixture.referenceSettings.approx_min_span_tree, false);

for (const reference of fixture.cases) {
  Deno.test(`exact mutual-reachability MST matches pinned Python weights for ${reference.name}`, async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      const dimensions = reference.vectors[0].length;
      await connection.run(`SET threads=1; CREATE TEMP TABLE vectors AS
        SELECT vertex,vec::DOUBLE[${dimensions}] AS vec FROM (VALUES
          ${
        reference.vectors.map((vector, vertex) =>
          `(${vertex},[${vector.join(",")}])`
        ).join(",")
      }) t(vertex,vec)`);
      await buildExactMutualReachabilityMst(
        connection,
        { count: reference.vectors.length, minSamples: reference.minSamples },
        { metric: reference.metric },
        {
          rows: '"vectors"',
          coreDistances: '"core_distances"',
          frontier: '"mst_frontier"',
          mst: '"mst"',
        },
      );
      const coreDistances = (await connection.runAndReadAll(
        "SELECT distance FROM core_distances ORDER BY vertex",
      )).getRowsJS().map((row) => Number(row[0]));
      assertEquals(coreDistances.length, reference.coreDistances.length);
      coreDistances.forEach((distance, index) =>
        assertAlmostEquals(distance, reference.coreDistances[index], 1e-12)
      );

      // Tied mutual-reachability weights can yield multiple valid edge sets.
      // Comparing the sorted weight multiset verifies the exact MST objective
      // independently of Python's internal tie choice.
      const weights = (await connection.runAndReadAll(
        "SELECT distance FROM mst ORDER BY distance",
      )).getRowsJS().map((row) => Number(row[0]));
      const expected = reference.mst.map((edge) => edge[2]).toSorted((a, b) =>
        a - b
      );
      assertEquals(weights.length, reference.vectors.length - 1);
      weights.forEach((distance, index) =>
        assertAlmostEquals(distance, expected[index], 1e-12)
      );
      // A matching multiset alone does not establish that returned endpoints
      // form a tree or that each reported weight belongs to its actual edge.
      assertEquals(
        await inspectGraphConnectivity(
          connection,
          '"mst"',
          reference.vectors.length,
        ),
        { componentCount: 1, sizes: [reference.vectors.length] },
      );
      const edges = (await connection.runAndReadAll(
        "SELECT * FROM mst ORDER BY source,target",
      )).getRowsJS();
      for (const [sourceValue, targetValue, weightValue] of edges) {
        const source = Number(sourceValue), target = Number(targetValue);
        const left = reference.vectors[source],
          right = reference.vectors[target];
        const dot = left.reduce((sum, value, i) => sum + value * right[i], 0);
        const norm = (values: number[]) =>
          Math.sqrt(values.reduce((sum, value) => sum + value * value, 0));
        const distance = reference.metric === "euclidean"
          ? Math.hypot(...left.map((value, i) => value - right[i]))
          : Math.max(0, 1 - dot / (norm(left) * norm(right)));
        assertAlmostEquals(
          Number(weightValue),
          Math.max(coreDistances[source], coreDistances[target], distance),
          1e-12,
        );
      }
      await buildExactMutualReachabilityMst(
        connection,
        { count: reference.vectors.length, minSamples: reference.minSamples },
        { metric: reference.metric },
        {
          rows: '"vectors"',
          coreDistances: '"core_distances"',
          frontier: '"mst_frontier"',
          mst: '"mst"',
        },
      );
      assertEquals(
        (await connection.runAndReadAll(
          "SELECT * FROM mst ORDER BY source,target",
        )).getRowsJS(),
        edges,
      );
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
}

Deno.test("exact mutual-reachability MST validates minSamples", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE vectors AS SELECT * FROM
      (VALUES (0,[0]::DOUBLE[1]),(1,[1]::DOUBLE[1])) t(vertex,vec)`);
    await assertRejects(
      () =>
        buildExactMutualReachabilityMst(
          connection,
          { count: 2, minSamples: 2 },
          { metric: "euclidean" },
          {
            rows: '"vectors"',
            coreDistances: '"core_distances"',
            frontier: '"mst_frontier"',
            mst: '"mst"',
          },
        ),
      Error,
      "between 1 and 1",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("exact MST rejects non-finite cross-group distances despite finite nearest distances", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE vectors AS SELECT * FROM
      (VALUES (0,[1e154]::DOUBLE[1]),(1,[1e154]::DOUBLE[1]),
        (2,[-1e154]::DOUBLE[1]),(3,[-1e154]::DOUBLE[1])) t(vertex,vec)`);
    await assertRejects(
      () =>
        buildExactMutualReachabilityMst(
          connection,
          { count: 4, minSamples: 1 },
          { metric: "euclidean" },
          {
            rows: '"vectors"',
            coreDistances: '"core_distances"',
            frontier: '"frontier"',
            mst: '"mst"',
          },
        ),
      Error,
      "non-finite value",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("exact MST supports identical points and minSamples at both valid boundaries", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE vectors AS
      SELECT i::INTEGER AS vertex,[1,2]::DOUBLE[2] AS vec FROM range(4) t(i)`);
    for (const minSamples of [1, 3]) {
      await buildExactMutualReachabilityMst(
        connection,
        { count: 4, minSamples },
        { metric: "cosine" },
        {
          rows: '"vectors"',
          coreDistances: '"core_distances"',
          frontier: '"frontier"',
          mst: '"mst"',
        },
      );
      assertEquals(
        (await connection.runAndReadAll(
          "SELECT * FROM mst ORDER BY source,target",
        ))
          .getRowsJS().map((row) => row.map(Number)),
        [[0, 1, 0], [0, 2, 0], [0, 3, 0]],
      );
    }
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
