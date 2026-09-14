import type { DuckDBConnection } from "@duckdb/node-api";

// All relation names are private, already-quoted SQL identifiers supplied by
// the owning UMAP operation. No input vectors cross the JS boundary.
export type UmapTables = {
  rows: string;
  knn: string;
  search: string;
  hnsw: string;
  candidates: string;
  scales: string;
  directed: string;
  graph: string;
};

export async function scalar(connection: DuckDBConnection, sql: string) {
  return Number((await connection.runAndReadAll(sql)).getRowsJS()[0][0]);
}

export default async function buildUmapGraph(
  connection: DuckDBConnection,
  input: { count: number; dimensions: number; neighbors: number },
  options: { metric: "euclidean" | "cosine"; search: "exact" | "hnsw" },
  names: UmapTables,
  signal?: AbortSignal,
) {
  signal?.throwIfAborted();
  await buildNeighbors(connection, input, options, names, signal);
  signal?.throwIfAborted();
  await buildFuzzyGraph(connection, input.neighbors, names, signal);
  signal?.throwIfAborted();
  const edges = await scalar(connection, `SELECT count(*) FROM ${names.graph}`);
  const source = new Uint32Array(edges),
    target = new Uint32Array(edges),
    weight = new Float64Array(edges);
  const rows = await connection.stream(
    `SELECT source,target,weight FROM ${names.graph} ORDER BY source,target`,
  );
  let edge = 0;
  for await (const chunk of rows.yieldRowsJs()) {
    signal?.throwIfAborted();
    for (const row of chunk) {
      source[edge] = Number(row[0]);
      target[edge] = Number(row[1]);
      weight[edge] = Number(row[2]);
      edge++;
    }
  }
  if (edge !== edges) throw new Error("Graph changed during transfer.");
  return { source, target, weight };
}

async function buildNeighbors(
  connection: DuckDBConnection,
  input: { count: number; dimensions: number; neighbors: number },
  options: { metric: "euclidean" | "cosine"; search: "exact" | "hnsw" },
  names: UmapTables,
  signal?: AbortSignal,
) {
  const { count, dimensions, neighbors } = input;
  const distance = options.metric === "cosine"
    ? "array_cosine_distance"
    : "array_distance";
  // Exact duplicates must have zero cosine distance. Positive roundoff would
  // otherwise change rho to that error instead of the next distinct neighbor.
  const exactDistance = options.metric === "cosine"
    ? "CASE WHEN a.vec=b.vec THEN 0 ELSE greatest(0,array_cosine_distance(a.vec,b.vec)) END"
    : "array_distance(a.vec,b.vec)";
  await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.knn}
    (source INTEGER, target INTEGER, distance DOUBLE);
    INSERT INTO ${names.knn} SELECT vertex, vertex, 0 FROM ${names.rows}`);
  let plan = "";
  if (options.search === "exact") {
    // O(n²d) work, but only a bounded source batch and top-k heaps, never a
    // materialized n×n matrix. Include target id in the key for stable ties.
    for (let offset = 0; offset < count; offset += 32) {
      signal?.throwIfAborted();
      const query = `SELECT source, item.target, item.distance FROM (
        SELECT a.vertex AS source,
          min_by(struct_pack(target := b.vertex, distance := ${exactDistance}),
            struct_pack(distance := ${exactDistance}, target := b.vertex),
            ${neighbors - 1}) AS closest
        FROM ${names.rows} a CROSS JOIN ${names.rows} b
        WHERE a.vertex >= ${offset} AND a.vertex < ${offset + 32}
          AND a.vertex != b.vertex GROUP BY a.vertex
      ), UNNEST(closest) AS t(item)`;
      if (!plan) {
        plan = JSON.stringify(
          (await connection.runAndReadAll(`EXPLAIN ${query}`)).getRowsJS(),
        );
      }
      await connection.run(`INSERT INTO ${names.knn} ${query}`);
    }
  } else {
    await connection.run(`INSTALL vss; LOAD vss;
      CREATE OR REPLACE TEMP TABLE ${names.search} AS
      SELECT vertex, vec::FLOAT[${dimensions}] AS vec FROM ${names.rows} ORDER BY vertex`);
    if (
      await scalar(
        connection,
        `SELECT count(*) FROM ${names.search} WHERE
        NOT isfinite(array_inner_product(vec,vec))
        ${
          options.metric === "cosine"
            ? "OR array_inner_product(vec,vec)=0"
            : ""
        }`,
      )
    ) {
      throw new Error(
        "HNSW requires vectors with finite FLOAT norms (and nonzero cosine norms).",
      );
    }
    await connection.run(
      `CREATE INDEX ${names.hnsw} ON ${names.search} USING HNSW(vec)
      WITH (metric='${options.metric === "cosine" ? "cosine" : "l2sq"}',
        ef_construction=128, ef_search=128, M=16)`,
    );
    const previous = String(
      (await connection.runAndReadAll(
        "SELECT current_setting('disabled_optimizers')",
      )).getRowsJS()[0][0],
    );
    // The shipped VSS optimizer recognizes the window form of a lateral top-k.
    // DuckDB 1.5.5's top_n_window_elimination otherwise hides that pattern.
    const disabled = [
      ...new Set([
        ...previous.split(",").filter(Boolean),
        "top_n_window_elimination",
      ]),
    ].join(",");
    try {
      await connection.run(
        `SET disabled_optimizers='${disabled.replaceAll("'", "''")}'`,
      );
      const query = `SELECT a.vertex AS source, b.vertex AS target, b.distance
        FROM ${names.search} a, LATERAL (
          SELECT vertex, ${distance}(vec,a.vec) AS distance FROM ${names.search}
          ORDER BY distance LIMIT ${Math.min(neighbors + 1, count - 1)}
        ) b`;
      // Materialize ONLY ids and scalar distances before ranking. Keeping the
      // vector joins inside the window query makes DuckDB carry two full DOUBLE
      // vectors per candidate through the sort (O(n*k*d) scratch memory).
      const candidates = `SELECT q.source,q.target,${exactDistance} AS distance
        FROM (${query}) q JOIN ${names.rows} a ON q.source=a.vertex
        JOIN ${names.rows} b ON q.target=b.vertex WHERE q.source != q.target`;
      plan = JSON.stringify(
        (await connection.runAndReadAll(`EXPLAIN ${candidates}`)).getRowsJS(),
      );
      if (!plan.includes("HNSW_INDEX_JOIN")) {
        // The optimizer can retain a correlated cross product for tiny or
        // duplicate-heavy inputs. Only small inputs may use our bounded exact
        // implementation; never execute the unbounded candidate query.
        if (count <= 1000) {
          return await buildNeighbors(
            connection,
            input,
            {
              ...options,
              search: "exact",
            },
            names,
            signal,
          );
        }
        throw new Error(
          "VSS did not produce HNSW_INDEX_JOIN; refusing an unbounded all-pairs fallback. Use search: 'exact' if quadratic work is acceptable.",
        );
      }
      // Exclude self AFTER index search, then stable-sort candidates and keep k-1.
      // Recompute candidate distances in DOUBLE to isolate ANN candidate error.
      await connection.run(
        `CREATE OR REPLACE TEMP TABLE ${names.candidates} AS ${candidates};
        INSERT INTO ${names.knn} SELECT source,target,distance FROM ${names.candidates}
        QUALIFY row_number() OVER (PARTITION BY source
          ORDER BY distance,target) <= ${neighbors - 1}`,
      );
    } finally {
      await connection.run(
        `SET disabled_optimizers='${previous.replaceAll("'", "''")}'`,
      );
    }
  }
  if (
    await scalar(connection, `SELECT count(*) FROM ${names.knn}`) !==
      count * neighbors
  ) {
    throw new Error(
      "Neighbor search did not return the required number of neighbors.",
    );
  }
  if (
    await scalar(
      connection,
      `SELECT count(*) FROM ${names.knn} WHERE NOT isfinite(distance)`,
    )
  ) {
    throw new Error("Distance computation returned a non-finite value.");
  }
  // Cosine roundoff can produce a tiny negative distance.
  await connection.run(`UPDATE ${names.knn} SET distance=greatest(0,distance)`);
  return plan;
}

async function buildFuzzyGraph(
  connection: DuckDBConnection,
  neighbors: number,
  names: UmapTables,
  signal?: AbortSignal,
) {
  // Smooth-kNN with local_connectivity=1, bandwidth=1, 64 bisection steps,
  // tolerance 1e-5 and the reference's 1e-3 minimum-distance scale.
  await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.scales} AS
    SELECT source, coalesce(min(distance) FILTER(WHERE distance>0),0) AS rho,
      avg(distance) AS mean_distance, 0::DOUBLE AS lo, 'Infinity'::DOUBLE AS hi,
      1::DOUBLE AS sigma, false AS done FROM ${names.knn} GROUP BY source`);
  for (let iteration = 0; iteration < 64; iteration++) {
    signal?.throwIfAborted();
    await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.scales} AS
      WITH sums AS (
        SELECT s.*, (SELECT sum(CASE WHEN n.distance <= s.rho THEN 1
          ELSE exp(-(n.distance-s.rho)/s.sigma) END)
          FROM ${names.knn} n WHERE n.source=s.source AND n.target != n.source) AS mass
        FROM ${names.scales} s
      ), bounds AS (
        SELECT * EXCLUDE(lo,hi,done),
          CASE WHEN NOT done AND mass < log2(${neighbors}) THEN sigma ELSE lo END AS lo,
          CASE WHEN NOT done AND mass > log2(${neighbors}) THEN sigma ELSE hi END AS hi,
          done OR abs(mass-log2(${neighbors})) < 1e-5 AS done FROM sums
      ) SELECT source,rho,mean_distance,lo,hi,
        CASE WHEN done THEN sigma WHEN isinf(hi) THEN sigma*2 ELSE (lo+hi)/2 END AS sigma,
        done FROM bounds`);
  }
  await connection.run(`UPDATE ${names.scales} SET sigma=greatest(sigma,0.001 *
    CASE WHEN rho>0 THEN mean_distance ELSE (SELECT avg(distance) FROM ${names.knn}) END);
    CREATE OR REPLACE TEMP TABLE ${names.directed} AS
    SELECT n.source,n.target,CASE WHEN n.distance<=s.rho OR s.sigma=0 THEN 1
      ELSE exp(-(n.distance-s.rho)/s.sigma) END AS weight
    FROM ${names.knn} n JOIN ${names.scales} s USING(source) WHERE n.source != n.target;
    CREATE OR REPLACE TEMP TABLE ${names.graph} AS
    SELECT coalesce(a.source,b.target) AS source, coalesce(a.target,b.source) AS target,
      coalesce(a.weight,0)+coalesce(b.weight,0)-coalesce(a.weight*b.weight,0) AS weight
    FROM ${names.directed} a FULL OUTER JOIN ${names.directed} b
      ON a.source=b.target AND a.target=b.source`);
}
