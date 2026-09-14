import { DuckDBInstance } from "@duckdb/node-api";
import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
  assertThrows,
} from "@std/assert";
import prototypeUmap, {
  buildFuzzyGraph,
  buildNeighbors,
  optimizeLayout,
  prepareInput,
  resolveOptions,
  scalar,
} from "../../../benchmarks/umap/prototypeUmap.ts";

async function withConnection(
  callback: (
    connection: Awaited<ReturnType<DuckDBInstance["connect"]>>,
  ) => Promise<void>,
) {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run("SET threads=1");
    await callback(connection);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
}

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../data/umap/reference.json", import.meta.url),
  ),
) as {
  version: string;
  cases: {
    metric: "cosine" | "euclidean";
    neighbors: number;
    vectors: number[][];
    sigma: number[];
    rho: number[];
    edges: { source: number; target: number; weight: number }[];
  }[];
};

for (const reference of fixture.cases) {
  Deno.test(`UMAP prototype: ${reference.metric} graph matches umap-learn ${fixture.version}, including duplicates`, () =>
    withConnection(async (connection) => {
      await connection.run(
        `CREATE TABLE input AS SELECT * FROM (VALUES ${
          reference.vectors.map((vector, id) => `(${id},[${vector.join(",")}])`)
            .join(",")
        }) t(id,vector)`,
      );
      const settings = resolveOptions(reference);
      const input = await prepareInput(connection, settings);
      await buildNeighbors(connection, input, settings);
      assertEquals(
        await scalar(
          connection,
          "SELECT distance FROM umap_knn WHERE source=0 AND target=1",
        ),
        0,
      );
      await buildFuzzyGraph(connection, input.neighbors);
      const edges = (await connection.runAndReadAll(
        "SELECT * FROM umap_graph ORDER BY source,target",
      )).getRowObjectsJS();
      const expected = reference.edges.toSorted((a, b) =>
        a.source - b.source || a.target - b.target
      );
      assertEquals(edges.length, expected.length);
      edges.forEach((edge, i) => {
        assertEquals(edge.source, expected[i].source);
        assertEquals(edge.target, expected[i].target);
        assertAlmostEquals(Number(edge.weight), expected[i].weight, 2e-5);
      });
      const scales = (await connection.runAndReadAll(
        "SELECT * FROM umap_scales ORDER BY source",
      )).getRowObjectsJS();
      scales.forEach((scale, i) => {
        assertAlmostEquals(Number(scale.rho), reference.rho[i], 2e-6);
        assertAlmostEquals(Number(scale.sigma), reference.sigma[i], 2e-5);
      });
    }));
}

Deno.test("UMAP prototype: preserves row identity, vectors and columns; stable across physical input order", () =>
  withConnection(async (connection) => {
    await connection.run(
      `CREATE TABLE input AS SELECT i AS id,'row-'||i AS label,
      [sin(i),cos(i),sin(i*3)]::FLOAT[3] AS vector FROM range(30) t(i)`,
    );
    await prototypeUmap(connection, { epochs: 30 });
    const first =
      (await connection.runAndReadAll("SELECT * FROM umap_result ORDER BY id"))
        .getRowsJS();
    assertEquals(first.length, 30);
    assertEquals(
      await scalar(
        connection,
        `SELECT count(*) FROM (
      (SELECT id,label,vector FROM umap_result EXCEPT ALL SELECT * FROM input)
      UNION ALL (SELECT * FROM input EXCEPT ALL SELECT id,label,vector FROM umap_result))`,
      ),
      0,
    );
    await connection.run(
      "CREATE OR REPLACE TABLE input AS SELECT * FROM input ORDER BY id DESC",
    );
    await prototypeUmap(connection, { epochs: 30 });
    assertEquals(
      (await connection.runAndReadAll("SELECT * FROM umap_result ORDER BY id"))
        .getRowsJS(),
      first,
    );
    await prototypeUmap(connection, { epochs: 30, seed: 99 });
    const changed =
      (await connection.runAndReadAll("SELECT * FROM umap_result ORDER BY id"))
        .getRowsJS();
    assert(
      changed.some((row, i) =>
        row[3] !== first[i][3] || row[4] !== first[i][4]
      ),
    );
  }));

Deno.test("UMAP prototype: first attractive update follows the UMAP gradient and moves both endpoints", () =>
  withConnection(async (connection) => {
    await connection.run(
      `CREATE TABLE umap_graph AS SELECT 0 AS source,1 AS target,1.0 AS weight;
      CREATE TABLE umap_layout AS SELECT * FROM (VALUES (0,0.0::DOUBLE,0.0::DOUBLE),
        (1,1.0,0.0),(2,3.0,3.0)) t(vertex,x,y)`,
    );
    await optimizeLayout(
      connection,
      3,
      resolveOptions({ epochs: 2, negativeSamples: 1, learningRate: 0.1 }),
    );
    const points = (await connection.runAndReadAll(
      "SELECT x,y FROM umap_layout ORDER BY vertex",
    )).getRowsJS();
    // At squared distance 1, d/dx log(1+a*d^(2b)) = 2ab/(1+a).
    const displacement = 0.1 * 2 * 1.5769434601962196 * 0.8950608781227859 /
      (1 + 1.5769434601962196);
    assertAlmostEquals(Number(points[0][0]), displacement, 1e-12);
    assertAlmostEquals(Number(points[1][0]), 1 - displacement, 1e-12);
    assertEquals(points[2], [3, 3]);
    assertEquals(points[0][1], 0);
  }));

Deno.test("UMAP prototype: identical vectors and small data stay finite; neighbors clamp", () =>
  withConnection(async (connection) => {
    await connection.run(
      "CREATE TABLE input AS SELECT i AS id,[0.0,0.0] AS vector FROM range(3) t(i)",
    );
    const result = await prototypeUmap(connection, { epochs: 20 });
    assertEquals(result.neighbors, 2);
    assertEquals(
      await scalar(
        connection,
        "SELECT count(*) FROM umap_result WHERE isfinite(umap_x) AND isfinite(umap_y)",
      ),
      3,
    );
  }));

for (
  const [expression, message] of [
    ["NULL::DOUBLE[]", "nonempty"],
    ["[]::DOUBLE[]", "nonempty"],
    ["[1.0,NULL]", "nonempty"],
    ["[1.0,'NaN'::DOUBLE]", "finite"],
    ["[1.0,'Infinity'::DOUBLE]", "finite"],
    ["[1e200,1e200]", "norms overflow"],
    ["CASE WHEN i=0 THEN [1.0] ELSE [1.0,2.0] END", "equal dimensions"],
    ["['one','two']", "numeric LIST or ARRAY"],
    ["[[1.0],[2.0]]", "numeric LIST or ARRAY"],
  ] as const
) {
  Deno.test(`UMAP prototype rejects invalid vectors: ${expression}`, () =>
    withConnection(async (connection) => {
      await connection.run(
        `CREATE TABLE input AS SELECT i AS id,${expression} AS vector FROM range(3) t(i)`,
      );
      await assertRejects(() => prototypeUmap(connection), Error, message);
    }));
}

Deno.test("UMAP prototype rejects zero cosine vectors, ambiguous ids, too few rows, and output collisions", () =>
  withConnection(async (connection) => {
    await connection.run(
      "CREATE TABLE input AS SELECT i AS id,[0.0,0.0] AS vector FROM range(3) t(i)",
    );
    await assertRejects(
      () => prototypeUmap(connection, { metric: "cosine" }),
      Error,
      "zero vector",
    );
    await connection.run("UPDATE input SET id=0");
    await assertRejects(
      () => prototypeUmap(connection),
      Error,
      "unique and non-null",
    );
    await connection.run("DELETE FROM input");
    await assertRejects(() => prototypeUmap(connection), Error, "at least 3");
    await connection.run("ALTER TABLE input ADD COLUMN umap_x DOUBLE");
    await assertRejects(
      () => prototypeUmap(connection),
      Error,
      "already contains",
    );
  }));

Deno.test("UMAP prototype validates numerical configuration before issuing queries", () => {
  assertThrows(() => resolveOptions({ neighbors: 1 }), Error, "at least 2");
  assertThrows(() => resolveOptions({ seed: -1 }), Error, "nonnegative");
  assertThrows(() => resolveOptions({ epochs: 0 }), Error, "positive");
  assertThrows(() => resolveOptions({ batches: 0.5 }), Error, "integer");
  assertThrows(() => resolveOptions({ learningRate: NaN }), Error, "finite");
});

Deno.test("UMAP prototype: VSS uses an indexed join and restores optimizer configuration", () =>
  withConnection(async (connection) => {
    await connection.run(`LOAD vss; SET disabled_optimizers='filter_pushdown';
      CREATE TABLE input AS SELECT i AS id,[sin(i),cos(i),sin(i*3)]::FLOAT[3] AS vector FROM range(50) t(i)`);
    const result = await prototypeUmap(connection, {
      search: "hnsw",
      metric: "cosine",
      epochs: 10,
    });
    assert(result.plan.includes("HNSW_INDEX_JOIN"));
    assert(
      !result.plan.includes("WINDOW"),
      "Candidate vectors must not be retained by a ranking window.",
    );
    assertEquals(
      await scalar(connection, "SELECT count(*) FROM umap_knn"),
      50 * 15,
    );
    assertEquals(
      (await connection.runAndReadAll(
        "SELECT current_setting('disabled_optimizers')",
      )).getRowsJS()[0][0],
      "filter_pushdown",
    );
    const indexedGraph = (await connection.runAndReadAll(
      "SELECT * FROM umap_graph ORDER BY source,target",
    )).getRowsJS();
    await prototypeUmap(connection, {
      search: "exact",
      metric: "cosine",
      epochs: 10,
    });
    assertEquals(
      (await connection.runAndReadAll(
        "SELECT * FROM umap_graph ORDER BY source,target",
      )).getRowsJS(),
      indexedGraph,
    );
  }));
