// Experimental, unpublished UMAP feasibility code. Use a dedicated scratch
// connection: this module owns umap_* tables, but never mutates input.
import type { DuckDBConnection } from "@duckdb/node-api";

export type PrototypeOptions = {
  neighbors?: number;
  metric?: "euclidean" | "cosine";
  search?: "exact" | "hnsw";
  epochs?: number;
  seed?: number;
  minDistance?: 0 | 0.1 | 0.5;
  learningRate?: number;
  negativeSamples?: number;
  batches?: number;
  exactBatchSize?: number;
};

// umap-learn 0.5.9.post2 find_ab_params(spread=1, min_dist=...). These
// development-generated presets avoid adding a curve-fitting runtime dependency.
const curves = {
  0: [1.9328083975546724, 0.7904949734010681],
  0.1: [1.5769434601962196, 0.8950608781227859],
  0.5: [0.583030020479462, 1.3341669929263487],
};

export function resolveOptions(options: PrototypeOptions = {}) {
  const resolved = {
    neighbors: 15,
    metric: "euclidean",
    search: "exact",
    epochs: 200,
    seed: 42,
    minDistance: 0.1,
    learningRate: 0.1,
    negativeSamples: 5,
    batches: 1,
    exactBatchSize: 32,
    ...options,
  };
  for (
    const key of [
      "neighbors",
      "epochs",
      "negativeSamples",
      "batches",
      "exactBatchSize",
    ] as const
  ) {
    if (!Number.isSafeInteger(resolved[key]) || resolved[key] < 1) {
      throw new Error(`${key} must be a positive safe integer.`);
    }
  }
  if (resolved.neighbors < 2) throw new Error("neighbors must be at least 2.");
  if (!Number.isSafeInteger(resolved.seed) || resolved.seed < 0) {
    throw new Error("seed must be a nonnegative safe integer.");
  }
  if (!Number.isFinite(resolved.learningRate) || resolved.learningRate <= 0) {
    throw new Error("learningRate must be finite and positive.");
  }
  if (![0, 0.1, 0.5].includes(resolved.minDistance)) {
    throw new Error("Prototype minDistance presets: 0, 0.1, 0.5 (spread=1).");
  }
  if (!["euclidean", "cosine"].includes(resolved.metric)) {
    throw new Error("metric must be euclidean or cosine.");
  }
  if (!["exact", "hnsw"].includes(resolved.search)) {
    throw new Error("search must be exact or hnsw.");
  }
  return resolved;
}

export async function scalar(connection: DuckDBConnection, sql: string) {
  const value = (await connection.runAndReadAll(sql)).getRowsJS()[0][0];
  if (typeof value !== "number" && typeof value !== "bigint") {
    throw new Error(`Expected a numeric scalar, received ${value}.`);
  }
  return Number(value);
}

// Contract for this lab: input(id, vector, ...). id must uniquely and stably
// identify rows; numeric LIST and ARRAY vectors are accepted. Source rows,
// including duplicate vectors and all other columns, survive in umap_result.
export async function prepareInput(
  connection: DuckDBConnection,
  options: ReturnType<typeof resolveOptions>,
) {
  const schema = (await connection.runAndReadAll("DESCRIBE input"))
    .getRowObjectsJS();
  const vectorType = schema.find((row) => row.column_name === "vector")
    ?.column_type;
  if (
    typeof vectorType !== "string" ||
    !/^(FLOAT|DOUBLE|TINYINT|SMALLINT|INTEGER|BIGINT|HUGEINT|UTINYINT|USMALLINT|UINTEGER|UBIGINT|UHUGEINT|DECIMAL\(\d+,\d+\))\[\d*\]$/
      .test(vectorType)
  ) {
    throw new Error(
      "input.vector must be a one-dimensional numeric LIST or ARRAY.",
    );
  }
  if (!schema.some((row) => row.column_name === "id")) {
    throw new Error("input.id is required for stable row identity.");
  }
  if (
    schema.some((row) => ["umap_x", "umap_y"].includes(String(row.column_name)))
  ) {
    throw new Error("input already contains umap_x or umap_y.");
  }
  const count = await scalar(connection, "SELECT count(*) FROM input");
  if (count < 3) throw new Error("This prototype requires at least 3 rows.");
  if (
    await scalar(
      connection,
      "SELECT count(DISTINCT id) FROM input WHERE id IS NOT NULL",
    ) !== count
  ) throw new Error("input.id must be unique and non-null.");
  if (
    await scalar(
      connection,
      `SELECT count(*) FROM input WHERE vector IS NULL OR len(vector)=0
        OR list_count(vector) != len(vector)
        OR NOT list_bool_and(list_transform(vector, x -> isfinite(x::DOUBLE)))`,
    )
  ) {
    throw new Error(
      "Vectors must be nonempty, non-null and contain finite numbers only.",
    );
  }
  if (
    await scalar(
      connection,
      "SELECT count(DISTINCT len(vector)) FROM input",
    ) !== 1
  ) {
    throw new Error("Vectors must have equal dimensions.");
  }
  const dimensions = await scalar(
    connection,
    "SELECT len(vector) FROM input LIMIT 1",
  );
  // DOUBLE avoids FLOAT overflow while checking norms. Reject extreme values
  // whose distance arithmetic cannot be represented rather than emitting NaNs.
  await connection.run(`CREATE OR REPLACE TEMP TABLE umap_rows AS
    SELECT (row_number() OVER (ORDER BY id)-1)::INTEGER AS vertex, id,
      vector::DOUBLE[${dimensions}] AS vec FROM input`);
  if (
    await scalar(
      connection,
      `SELECT count(*) FROM umap_rows
      WHERE NOT isfinite(array_inner_product(vec,vec))
        OR array_inner_product(vec,vec) > 1e300
        ${
        options.metric === "cosine" ? "OR array_inner_product(vec,vec) = 0" : ""
      }`,
    )
  ) {
    throw new Error(
      "Vector norms overflow, or cosine distance received a zero vector.",
    );
  }
  return {
    count,
    dimensions,
    neighbors: Math.min(options.neighbors, count - 1),
  };
}

export async function buildNeighbors(
  connection: DuckDBConnection,
  input: Awaited<ReturnType<typeof prepareInput>>,
  options: ReturnType<typeof resolveOptions>,
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
  await connection.run(`CREATE OR REPLACE TEMP TABLE umap_knn
    (source INTEGER, target INTEGER, distance DOUBLE);
    INSERT INTO umap_knn SELECT vertex, vertex, 0 FROM umap_rows`);
  let plan = "";
  if (options.search === "exact") {
    // O(n²d) work, but only a bounded source batch and top-k heaps, never a
    // materialized n×n matrix. Include target id in the key for stable ties.
    for (let offset = 0; offset < count; offset += options.exactBatchSize) {
      const query = `SELECT source, item.target, item.distance FROM (
        SELECT a.vertex AS source,
          min_by(struct_pack(target := b.vertex, distance := ${exactDistance}),
            struct_pack(distance := ${exactDistance}, target := b.vertex),
            ${neighbors - 1}) AS closest
        FROM umap_rows a CROSS JOIN umap_rows b
        WHERE a.vertex >= ${offset} AND a.vertex < ${
        offset + options.exactBatchSize
      }
          AND a.vertex != b.vertex GROUP BY a.vertex
      ), UNNEST(closest) AS t(item)`;
      if (!plan) {
        plan = JSON.stringify(
          (await connection.runAndReadAll(`EXPLAIN ${query}`)).getRowsJS(),
        );
      }
      await connection.run(`INSERT INTO umap_knn ${query}`);
    }
  } else {
    await connection.run(`LOAD vss;
      CREATE OR REPLACE TABLE umap_search AS
      SELECT vertex, vec::FLOAT[${dimensions}] AS vec FROM umap_rows ORDER BY vertex`);
    if (
      await scalar(
        connection,
        `SELECT count(*) FROM umap_search WHERE
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
    await connection.run(`CREATE INDEX umap_hnsw ON umap_search USING HNSW(vec)
      WITH (metric='${options.metric === "cosine" ? "cosine" : "l2sq"}',
        ef_construction=128, ef_search=128, M=16)`);
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
      await connection.run(`SET disabled_optimizers='${disabled}'`);
      const query = `SELECT a.vertex AS source, b.vertex AS target, b.distance
        FROM umap_search a, LATERAL (
          SELECT vertex, ${distance}(vec,a.vec) AS distance FROM umap_search
          ORDER BY distance LIMIT ${neighbors + 1}
        ) b`;
      // Materialize ONLY ids and scalar distances before ranking. Keeping the
      // vector joins inside the window query makes DuckDB carry two full DOUBLE
      // vectors per candidate through the sort (O(n*k*d) scratch memory).
      const candidates = `SELECT q.source,q.target,${exactDistance} AS distance
        FROM (${query}) q JOIN umap_rows a ON q.source=a.vertex
        JOIN umap_rows b ON q.target=b.vertex WHERE q.source != q.target`;
      plan = JSON.stringify(
        (await connection.runAndReadAll(`EXPLAIN ${candidates}`)).getRowsJS(),
      );
      if (!plan.includes("HNSW_INDEX_JOIN")) {
        throw new Error(
          "VSS did not produce HNSW_INDEX_JOIN; refusing an unbounded all-pairs fallback.",
        );
      }
      // Exclude self AFTER index search, then stable-sort candidates and keep k-1.
      // Recompute candidate distances in DOUBLE to isolate ANN candidate error.
      await connection.run(
        `CREATE OR REPLACE TEMP TABLE umap_candidates AS ${candidates};
        INSERT INTO umap_knn SELECT source,target,distance FROM umap_candidates
        QUALIFY row_number() OVER (PARTITION BY source
          ORDER BY distance,target) <= ${neighbors - 1}`,
      );
    } finally {
      await connection.run(`SET disabled_optimizers='${previous}'`);
    }
  }
  if (
    await scalar(connection, "SELECT count(*) FROM umap_knn") !==
      count * neighbors
  ) {
    throw new Error(
      "Neighbor search did not return the required number of neighbors.",
    );
  }
  if (
    await scalar(
      connection,
      "SELECT count(*) FROM umap_knn WHERE NOT isfinite(distance)",
    )
  ) {
    throw new Error("Distance computation returned a non-finite value.");
  }
  // Cosine roundoff can produce a tiny negative distance.
  await connection.run("UPDATE umap_knn SET distance=greatest(0,distance)");
  return plan;
}

export async function buildFuzzyGraph(
  connection: DuckDBConnection,
  neighbors: number,
) {
  // Smooth-kNN with local_connectivity=1, bandwidth=1, 64 bisection steps,
  // tolerance 1e-5 and the reference's 1e-3 minimum-distance scale.
  await connection.run(`CREATE OR REPLACE TEMP TABLE umap_scales AS
    SELECT source, coalesce(min(distance) FILTER(WHERE distance>0),0) AS rho,
      avg(distance) AS mean_distance, 0::DOUBLE AS lo, 'Infinity'::DOUBLE AS hi,
      1::DOUBLE AS sigma, false AS done FROM umap_knn GROUP BY source`);
  for (let iteration = 0; iteration < 64; iteration++) {
    await connection.run(`CREATE OR REPLACE TEMP TABLE umap_scales AS
      WITH sums AS (
        SELECT s.*, (SELECT sum(CASE WHEN n.distance <= s.rho THEN 1
          ELSE exp(-(n.distance-s.rho)/s.sigma) END)
          FROM umap_knn n WHERE n.source=s.source AND n.target != n.source) AS mass
        FROM umap_scales s
      ), bounds AS (
        SELECT * EXCLUDE(lo,hi,done),
          CASE WHEN NOT done AND mass < log2(${neighbors}) THEN sigma ELSE lo END AS lo,
          CASE WHEN NOT done AND mass > log2(${neighbors}) THEN sigma ELSE hi END AS hi,
          done OR abs(mass-log2(${neighbors})) < 1e-5 AS done FROM sums
      ) SELECT source,rho,mean_distance,lo,hi,
        CASE WHEN done THEN sigma WHEN isinf(hi) THEN sigma*2 ELSE (lo+hi)/2 END AS sigma,
        done FROM bounds`);
  }
  await connection.run(`UPDATE umap_scales SET sigma=greatest(sigma,0.001 *
    CASE WHEN rho>0 THEN mean_distance ELSE (SELECT avg(distance) FROM umap_knn) END);
    CREATE OR REPLACE TEMP TABLE umap_directed AS
    SELECT n.source,n.target,CASE WHEN n.distance<=s.rho OR s.sigma=0 THEN 1
      ELSE exp(-(n.distance-s.rho)/s.sigma) END AS weight
    FROM umap_knn n JOIN umap_scales s USING(source) WHERE n.source != n.target;
    CREATE OR REPLACE TEMP TABLE umap_graph AS
    SELECT coalesce(a.source,b.target) AS source, coalesce(a.target,b.source) AS target,
      coalesce(a.weight,0)+coalesce(b.weight,0)-coalesce(a.weight*b.weight,0) AS weight
    FROM umap_directed a FULL OUTER JOIN umap_directed b
      ON a.source=b.target AND a.target=b.source`);
}

export async function initializeLayout(
  connection: DuckDBConnection,
  seed: number,
) {
  // Counter-based deterministic random initialization. This is intentionally
  // independent of SQL scan order. DuckDB hash stability across versions is NOT
  // guaranteed; pin the DuckDB version and threads for reproducible experiments.
  await connection.run(`CREATE OR REPLACE TEMP TABLE umap_layout AS
    SELECT vertex, (hash(${seed},vertex,0)%1000000000)::DOUBLE/1e9*20-10 AS x,
      (hash(${seed},vertex,1)%1000000000)::DOUBLE/1e9*20-10 AS y FROM umap_rows;
    CREATE OR REPLACE TEMP TABLE umap_initial AS SELECT * FROM umap_layout`);
}

export async function optimizeLayout(
  connection: DuckDBConnection,
  count: number,
  options: ReturnType<typeof resolveOptions>,
  onEpoch?: (epoch: number) => void,
) {
  const [a, b] = curves[options.minDistance as keyof typeof curves];
  const { epochs, negativeSamples, batches, learningRate, seed } = options;
  await connection.run(`CREATE OR REPLACE TEMP TABLE umap_schedule AS
    SELECT (row_number() OVER (ORDER BY source,target)-1)::BIGINT AS edge,
      source,target, max(weight) OVER()/weight AS period,
      max(weight) OVER()/weight AS next_positive,
      max(weight) OVER()/weight/${negativeSamples} AS next_negative
    FROM umap_graph WHERE weight>0 AND weight >=
      (SELECT max(weight) FROM umap_graph)/${epochs > 10 ? epochs : 500}`);
  for (let epoch = 0; epoch < epochs; epoch++) {
    // Follow the reference epoch schedule, including its alpha update after
    // each epoch. Deviation: edges in a batch read a common coordinate snapshot.
    const alpha = learningRate * (1 - Math.max(0, epoch - 1) / epochs);
    for (let batch = 0; batch < batches; batch++) {
      await connection.run(`CREATE OR REPLACE TEMP TABLE umap_events AS
        SELECT *, greatest(0,floor((${epoch}-next_negative)/(period/${negativeSamples})))::INTEGER AS draws
        FROM umap_schedule WHERE next_positive<=${epoch} AND edge%${batches}=${batch};
        CREATE OR REPLACE TEMP TABLE umap_gradients AS
        WITH pairs AS (
          SELECT edge,source,target,0 AS kind,-1::BIGINT AS draw FROM umap_events
          UNION ALL
          SELECT e.edge,e.source,(hash(${seed},${epoch},e.edge,t.draw)%${count})::INTEGER,
            1 AS kind,t.draw FROM umap_events e,LATERAL range(e.draws) t(draw)
        ), deltas AS (
          SELECT p.*, u.x-v.x AS dx,u.y-v.y AS dy,
            (u.x-v.x)^2+(u.y-v.y)^2 AS d2
          FROM pairs p JOIN umap_layout u ON p.source=u.vertex
            JOIN umap_layout v ON p.target=v.vertex
        ), coefficients AS (
          SELECT *, CASE WHEN d2=0 THEN 0 WHEN kind=0 THEN
            -2*${a}*${b}*pow(d2,${b}-1)/(1+${a}*pow(d2,${b}))
            ELSE 2*${b}/((0.001+d2)*(1+${a}*pow(d2,${b}))) END AS coefficient
          FROM deltas
        ) SELECT edge,source,target,kind,draw,
          greatest(-4,least(4,coefficient*dx))*${alpha} AS dx,
          greatest(-4,least(4,coefficient*dy))*${alpha} AS dy FROM coefficients;
        CREATE OR REPLACE TEMP TABLE umap_layout AS
        WITH contributions AS (
          SELECT source AS vertex,edge,kind,draw,dx,dy FROM umap_gradients
          UNION ALL
          SELECT target,edge,2 AS kind,draw,-dx,-dy FROM umap_gradients WHERE kind=0
        ), updates AS (
          SELECT vertex,sum(dx ORDER BY edge,kind,draw) AS dx,
            sum(dy ORDER BY edge,kind,draw) AS dy FROM contributions GROUP BY vertex
        ) SELECT l.vertex,l.x+coalesce(u.dx,0) AS x,l.y+coalesce(u.dy,0) AS y
        FROM umap_layout l LEFT JOIN updates u USING(vertex);
        UPDATE umap_schedule s SET next_positive=s.next_positive+s.period,
          next_negative=s.next_negative+e.draws*s.period/${negativeSamples}
          FROM umap_events e WHERE s.edge=e.edge`);
    }
    if (epoch % 25 === 0 || epoch === epochs - 1) {
      if (
        await scalar(
          connection,
          "SELECT count(*) FROM umap_layout WHERE NOT isfinite(x) OR NOT isfinite(y)",
        )
      ) {
        throw new Error(`Non-finite coordinates at epoch ${epoch}.`);
      }
    }
    onEpoch?.(epoch + 1);
  }
}

export default async function prototypeUmap(
  connection: DuckDBConnection,
  options: PrototypeOptions = {},
  onStage?: (stage: string, milliseconds: number) => void | Promise<void>,
  onEpoch?: (epoch: number) => void,
) {
  const settings = resolveOptions(options);
  let start = performance.now();
  const input = await prepareInput(connection, settings);
  await onStage?.("validation", performance.now() - start);
  start = performance.now();
  const plan = await buildNeighbors(connection, input, settings);
  await onStage?.("neighbors", performance.now() - start);
  start = performance.now();
  await buildFuzzyGraph(connection, input.neighbors);
  await onStage?.("fuzzyGraph", performance.now() - start);
  await initializeLayout(connection, settings.seed);
  start = performance.now();
  await optimizeLayout(connection, input.count, settings, onEpoch);
  await onStage?.("layout", performance.now() - start);
  await connection.run(`CREATE OR REPLACE TEMP TABLE umap_result AS
    SELECT i.*,l.x AS umap_x,l.y AS umap_y FROM input i
    JOIN umap_rows r ON i.id=r.id JOIN umap_layout l USING(vertex)`);
  return { ...input, settings, plan };
}
