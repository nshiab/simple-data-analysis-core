import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";
import { DuckDBInstance } from "@duckdb/node-api";

import buildVectorNeighbors from "../../../src/helpers/buildVectorNeighbors.ts";
import inspectGraphConnectivity from "../../../src/helpers/inspectGraphConnectivity.ts";

test("graph connectivity reports components including isolated vertices", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(
      `CREATE TEMP TABLE edges(source INTEGER,target INTEGER);
      INSERT INTO edges VALUES (0,1),(1,2),(3,4)`,
    );
    expect(await inspectGraphConnectivity(connection, '"edges"', 6)).toStrictEqual({
      componentCount: 3,
      sizes: [3, 2, 1],
    });
    await connection.run("INSERT INTO edges VALUES (2,3),(4,5)");
    expect(await inspectGraphConnectivity(connection, '"edges"', 6)).toStrictEqual({
      componentCount: 1,
      sizes: [6],
    });
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

test("an exact fixed-k graph can omit every edge between dense groups", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE vectors AS SELECT * FROM (VALUES
      (0,[0.0]::DOUBLE[1]),(1,[0.1]::DOUBLE[1]),(2,[0.2]::DOUBLE[1]),
      (3,[10.0]::DOUBLE[1]),(4,[10.1]::DOUBLE[1]),(5,[10.2]::DOUBLE[1])
      ) t(vertex,vec)`);
    await buildVectorNeighbors(
      connection,
      { count: 6, dimensions: 1, neighborCount: 1 },
      { metric: "euclidean", search: "exact", includeSelf: false },
      {
        rows: '"vectors"',
        neighbors: '"neighbors"',
        search: '"neighbor_search"',
        hnsw: '"neighbor_hnsw"',
        candidates: '"neighbor_candidates"',
      },
    );
    expect(await inspectGraphConnectivity(connection, '"neighbors"', 6)).toStrictEqual({
      componentCount: 2,
      sizes: [3, 3],
    });
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

test("graph connectivity rejects invalid edge ids", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(
      'CREATE TEMP TABLE edges AS SELECT 0::INTEGER AS "source",3::INTEGER AS "target"',
    );
    for (const target of ["3", "NULL", "-1"]) {
      await connection.run(`UPDATE edges SET target=${target}`);
      await assertRejects(
        () => inspectGraphConnectivity(connection, '"edges"', 3),
        Error,
        "invalid vertex id",
      );
    }
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
