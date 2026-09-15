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
      "exactly 4 unique integer vertex ids",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("exact neighbors reject overflowing distances even outside the nearest ranks", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE ${names.rows} AS SELECT * FROM
      (VALUES (0,[1e154]::DOUBLE[1]),(1,[1e154]::DOUBLE[1]),
        (2,[-1e154]::DOUBLE[1]),(3,[-1e154]::DOUBLE[1])) t(vertex,vec)`);
    await assertRejects(
      () =>
        buildVectorNeighbors(
          connection,
          { count: 4, dimensions: 1, neighborCount: 1 },
          { metric: "euclidean", search: "exact", includeSelf: false },
          names,
        ),
      Error,
      "non-finite value",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("neighbors reject duplicate or noncontiguous positional identities", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    for (const ids of ["0,0,2", "1,2,3", "0,1,NULL", "0,0.5,2"]) {
      await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.rows} AS
        SELECT vertex,[1]::DOUBLE[1] AS vec FROM UNNEST([${ids}]) t(vertex)`);
      await assertRejects(
        () =>
          buildVectorNeighbors(
            connection,
            { count: 3, dimensions: 1, neighborCount: 1 },
            { metric: "euclidean", search: "exact", includeSelf: false },
            names,
          ),
        Error,
        "unique integer vertex ids",
      );
    }
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("HNSW supports all-row self-inclusive neighborhoods and restores settings", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`SET disabled_optimizers='filter_pushdown';
      CREATE TEMP TABLE ${names.rows} AS SELECT * FROM
      (VALUES (0,[0]::DOUBLE[1]),(1,[2]::DOUBLE[1])) t(vertex,vec)`);
    await buildVectorNeighbors(
      connection,
      { count: 2, dimensions: 1, neighborCount: 2 },
      { metric: "euclidean", search: "hnsw", includeSelf: true },
      names,
    );
    assertEquals(
      (await connection.runAndReadAll(`SELECT source,target,rank,distance
      FROM ${names.neighbors} ORDER BY source,rank`)).getRowsJS().map((row) =>
        row.map(Number)
      ),
      [[0, 0, 0, 0], [0, 1, 1, 2], [1, 1, 0, 0], [1, 0, 1, 2]],
    );
    assertEquals(
      (await connection.runAndReadAll(
        "SELECT current_setting('disabled_optimizers')",
      ))
        .getRowsJS()[0][0],
      "filter_pushdown",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
