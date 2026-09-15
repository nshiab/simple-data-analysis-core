import { DuckDBInstance } from "@duckdb/node-api";
import { assertEquals, assertRejects } from "@std/assert";
import buildVectorNeighbors from "../../../src/helpers/buildVectorNeighbors.ts";

const names = {
  rows: '"vectors"',
  neighbors: '"neighbors"',
  search: '"neighbor_search"',
  hnsw: '"neighbor_hnsw"',
  candidates: '"neighbor_candidates"',
};

for (const search of ["exact", "hnsw"] as const) {
  Deno.test(`vector neighbor ${search} search has stable ties and explicit self semantics`, async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      await connection.run(`SET threads=1;
        CREATE TEMP TABLE ${names.rows} AS SELECT * FROM (VALUES
          (0,[0,0]::DOUBLE[2]),(1,[0,0]::DOUBLE[2]),
          (2,[1,0]::DOUBLE[2]),(3,[-1,0]::DOUBLE[2]),
          (4,[0,2]::DOUBLE[2])) t(vertex,vec)`);
      await buildVectorNeighbors(
        connection,
        { count: 5, dimensions: 2, neighborCount: 3 },
        { metric: "euclidean", search, includeSelf: true },
        names,
      );
      assertEquals(
        (await connection.runAndReadAll(
          `SELECT source,target,rank,distance FROM ${names.neighbors}
            WHERE source=0 ORDER BY rank`,
        )).getRowsJS().map((row) => row.map(Number)),
        [[0, 0, 0, 0], [0, 1, 1, 0], [0, 2, 2, 1]],
      );

      await buildVectorNeighbors(
        connection,
        { count: 5, dimensions: 2, neighborCount: 2 },
        { metric: "euclidean", search, includeSelf: false },
        names,
      );
      assertEquals(
        (await connection.runAndReadAll(
          `SELECT source,target,rank,distance FROM ${names.neighbors}
            WHERE source=0 ORDER BY rank`,
        )).getRowsJS().map((row) => row.map(Number)),
        [[0, 1, 0, 0], [0, 2, 1, 1]],
      );
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
}

Deno.test("vector neighbor search supports the smallest datasets", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE ${names.rows} AS SELECT * FROM
      (VALUES (0,[0]::DOUBLE[1]),(1,[2]::DOUBLE[1])) t(vertex,vec)`);
    await buildVectorNeighbors(
      connection,
      { count: 2, dimensions: 1, neighborCount: 1 },
      { metric: "euclidean", search: "exact", includeSelf: false },
      names,
    );
    assertEquals(
      (await connection.runAndReadAll(
        `SELECT source,target,rank,distance FROM ${names.neighbors}
          ORDER BY source,rank`,
      )).getRowsJS().map((row) => row.map(Number)),
      [[0, 1, 0, 2], [1, 0, 0, 2]],
    );
    await assertRejects(
      () =>
        buildVectorNeighbors(
          connection,
          { count: 2, dimensions: 1, neighborCount: 2 },
          { metric: "euclidean", search: "exact", includeSelf: false },
          names,
        ),
      Error,
      "between 1 and 1",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

for (const search of ["exact", "hnsw"] as const) {
  Deno.test(`vector neighbor ${search} rejects zero cosine vectors and non-finite norms`, async () => {
    const db = await DuckDBInstance.create(":memory:");
    const connection = await db.connect();
    try {
      await connection.run(`CREATE TEMP TABLE ${names.rows} AS SELECT * FROM
        (VALUES (0,[0,0]::DOUBLE[2]),(1,[1,0]::DOUBLE[2])) t(vertex,vec)`);
      await assertRejects(
        () =>
          buildVectorNeighbors(
            connection,
            { count: 2, dimensions: 2, neighborCount: 1 },
            { metric: "cosine", search, includeSelf: false },
            names,
          ),
        Error,
        search === "hnsw" ? "nonzero cosine norms" : "nonzero vectors",
      );
      await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.rows} AS
        SELECT * FROM (VALUES (0,[1e308,1e308]::DOUBLE[2]),
          (1,[1,0]::DOUBLE[2])) t(vertex,vec)`);
      await assertRejects(
        () =>
          buildVectorNeighbors(
            connection,
            { count: 2, dimensions: 2, neighborCount: 1 },
            { metric: "euclidean", search, includeSelf: false },
            names,
          ),
        Error,
        "finite",
      );
    } finally {
      connection.closeSync();
      db.closeSync();
    }
  });
}

Deno.test("vector neighbor search detects insufficient source rows", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE ${names.rows} AS SELECT * FROM
      (VALUES (0,[0]::DOUBLE[1]),(1,[1]::DOUBLE[1]),
        (2,[2]::DOUBLE[1])) t(vertex,vec)`);
    await assertRejects(
      () =>
        buildVectorNeighbors(
          connection,
          { count: 4, dimensions: 1, neighborCount: 2 },
          { metric: "euclidean", search: "exact", includeSelf: true },
          names,
        ),
      Error,
      "6 rows; 8 were required",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
