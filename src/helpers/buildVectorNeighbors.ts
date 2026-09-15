import type { DuckDBConnection } from "@duckdb/node-api";
import readScalarNumber from "./readScalarNumber.ts";
import vectorDistanceExpression from "./vectorDistanceExpression.ts";
import validateVectorRowIds from "./validateVectorRowIds.ts";

/** Private, already-quoted relation names owned and cleaned up by the caller. */
export type VectorNeighborTables = {
  rows: string;
  neighbors: string;
  search: string;
  hnsw: string;
  candidates: string;
};

type NeighborInput = {
  count: number;
  dimensions: number;
  neighborCount: number;
};

type NeighborOptions = {
  metric: "euclidean" | "cosine";
  search: "exact" | "hnsw";
  includeSelf: boolean;
};

/**
 * Materialize ranked vector neighbors without moving source vectors into JS.
 *
 * `neighborCount` is the number of rows produced per source. When `includeSelf`
 * is true, the source is rank 0 and consumes one of those rows. Otherwise all
 * rows are other points. Ranks are zero-based and ties use target id order.
 * Input rows have unique contiguous `vertex` ids from 0 through count-1 and
 * validated, non-null, fixed-size DOUBLE `vec` values.
 *
 * The caller owns every supplied scratch relation and must drop them after
 * success or failure. Approximate search only approximates candidate retrieval;
 * candidate distances are recomputed from the DOUBLE source vectors before
 * stable final ranking.
 */
export default async function buildVectorNeighbors(
  connection: DuckDBConnection,
  input: NeighborInput,
  options: NeighborOptions,
  names: VectorNeighborTables,
): Promise<void> {
  const { count, dimensions, neighborCount } = input;
  await validateVectorRowIds(connection, names.rows, count);
  if (!Number.isSafeInteger(dimensions) || dimensions < 1) {
    throw new Error("Vector dimensions must be a positive safe integer.");
  }
  const maximum = count - (options.includeSelf ? 0 : 1);
  if (
    !Number.isSafeInteger(neighborCount) || neighborCount < 1 ||
    neighborCount > maximum
  ) {
    throw new Error(
      `Neighbor count must be a safe integer between 1 and ${maximum}.`,
    );
  }
  const normExpression = options.search === "hnsw"
    ? `array_inner_product(vec::FLOAT[${dimensions}],vec::FLOAT[${dimensions}])`
    : "array_inner_product(vec,vec)";
  if (
    await readScalarNumber(
      connection,
      `SELECT count(*) FROM ${names.rows} WHERE
        NOT isfinite(${normExpression})
        ${options.metric === "cosine" ? `OR ${normExpression}=0` : ""}`,
    )
  ) {
    throw new Error(
      options.search === "hnsw"
        ? "HNSW requires vectors with finite FLOAT norms (and nonzero cosine norms)."
        : options.metric === "cosine"
        ? "Neighbor search requires finite vector norms and cosine distance requires nonzero vectors."
        : "Neighbor search requires finite vector norms.",
    );
  }

  const distanceFunction = options.metric === "cosine"
    ? "array_cosine_distance"
    : "array_distance";
  // Equal vectors must have exactly zero cosine distance. Positive roundoff can
  // otherwise alter downstream density estimates. Clamp negative roundoff too.
  const exactDistance = vectorDistanceExpression(
    "a.vec",
    "b.vec",
    options.metric,
  );
  const otherCount = neighborCount - (options.includeSelf ? 1 : 0);

  await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.candidates}
    (source INTEGER, target INTEGER, distance DOUBLE)`);
  if (otherCount > 0) {
    if (options.search === "exact") {
      // O(n²d) work with a bounded source batch and top-k heaps. The full
      // distance matrix is never materialized.
      await buildExactCandidates(
        connection,
        input,
        names,
        exactDistance,
        otherCount,
      );
    } else {
      await buildHnswCandidates(
        connection,
        input,
        options,
        names,
        distanceFunction,
        exactDistance,
        otherCount,
      );
    }
  }

  if (
    await readScalarNumber(
      connection,
      `SELECT count(*) FROM ${names.candidates} WHERE distance IS NULL OR NOT isfinite(distance)`,
    )
  ) {
    throw new Error("Distance computation returned a non-finite value.");
  }

  const selfRows = options.includeSelf
    ? `SELECT vertex AS source,vertex AS target,0::DOUBLE AS distance FROM ${names.rows}`
    : "SELECT NULL::INTEGER AS source,NULL::INTEGER AS target,NULL::DOUBLE AS distance WHERE false";
  const rankOrder = options.includeSelf
    ? "CASE WHEN source=target THEN 0 ELSE 1 END,distance,target"
    : "distance,target";
  await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.neighbors} AS
    SELECT source,target,
      (row_number() OVER (PARTITION BY source ORDER BY ${rankOrder})-1)::INTEGER AS rank,
      greatest(0,distance)::DOUBLE AS distance
    FROM (${selfRows} UNION ALL
      SELECT source,target,distance FROM ${names.candidates})
    QUALIFY row_number() OVER (PARTITION BY source ORDER BY ${rankOrder})
      <= ${neighborCount}`);

  const produced = await readScalarNumber(
    connection,
    `SELECT count(*) FROM ${names.neighbors}`,
  );
  if (produced !== count * neighborCount) {
    throw new Error(
      `Neighbor search returned ${produced} rows; ${
        count * neighborCount
      } were required.`,
    );
  }
  if (
    await readScalarNumber(
      connection,
      `SELECT count(*) FROM ${names.neighbors} WHERE NOT isfinite(distance)`,
    )
  ) {
    throw new Error("Distance computation returned a non-finite value.");
  }
}

async function buildHnswCandidates(
  connection: DuckDBConnection,
  input: NeighborInput,
  options: NeighborOptions,
  names: VectorNeighborTables,
  distanceFunction: string,
  exactDistance: string,
  otherCount: number,
): Promise<void> {
  const { count, dimensions, neighborCount } = input;
  await connection.run(`INSTALL vss; LOAD vss;
    CREATE OR REPLACE TEMP TABLE ${names.search} AS
    SELECT vertex,vec::FLOAT[${dimensions}] AS vec
    FROM ${names.rows} ORDER BY vertex;
    CREATE INDEX ${names.hnsw} ON ${names.search} USING HNSW(vec)
    WITH (metric='${options.metric === "cosine" ? "cosine" : "l2sq"}',
      ef_construction=128,ef_search=128,M=16)`);
  const previous = String(
    (await connection.runAndReadAll(
      "SELECT current_setting('disabled_optimizers')",
    )).getRowsJS()[0][0],
  );
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
    // Preserve UMAP's established candidate budget when self is included.
    // Excluding self needs one extra result because HNSW normally returns it.
    const candidateCount = options.includeSelf
      ? Math.max(otherCount + 1, Math.min(neighborCount + 1, count - 1))
      : Math.min(otherCount + 1, count);
    const query = `SELECT a.vertex AS source,b.vertex AS target,b.distance
      FROM ${names.search} a,LATERAL (
        SELECT vertex,${distanceFunction}(vec,a.vec) AS distance
        FROM ${names.search} ORDER BY distance LIMIT ${candidateCount}
      ) b`;
    // Carry ids and scalar distances through the candidate relation. Recompute
    // in DOUBLE against source rows to isolate ANN retrieval from precision.
    const candidates = `SELECT q.source,q.target,${exactDistance} AS distance
      FROM (${query}) q JOIN ${names.rows} a ON q.source=a.vertex
      JOIN ${names.rows} b ON q.target=b.vertex WHERE q.source != q.target`;
    const plan = JSON.stringify(
      (await connection.runAndReadAll(`EXPLAIN ${candidates}`)).getRowsJS(),
    );
    if (!plan.includes("HNSW_INDEX_JOIN")) {
      if (count <= 1000) {
        return await buildExactCandidates(
          connection,
          input,
          names,
          exactDistance,
          otherCount,
        );
      }
      throw new Error(
        "DuckDB could not use its vector index for neighbor search.",
      );
    }
    await connection.run(`INSERT INTO ${names.candidates} ${candidates}`);
  } finally {
    await connection.run(
      `SET disabled_optimizers='${previous.replaceAll("'", "''")}'`,
    );
  }
}

async function buildExactCandidates(
  connection: DuckDBConnection,
  input: NeighborInput,
  names: VectorNeighborTables,
  exactDistance: string,
  otherCount: number,
): Promise<void> {
  for (let offset = 0; offset < input.count; offset += 32) {
    const query = `SELECT source,item.target,item.distance FROM (
      SELECT a.vertex AS source,
        CASE WHEN bool_and(isfinite(${exactDistance})) THEN
        min_by(struct_pack(target := b.vertex,distance := ${exactDistance}),
          struct_pack(distance := ${exactDistance},target := b.vertex),
          ${otherCount}) ELSE error('Distance computation returned a non-finite value.') END AS closest
      FROM ${names.rows} a CROSS JOIN ${names.rows} b
      WHERE a.vertex >= ${offset} AND a.vertex < ${offset + 32}
        AND a.vertex != b.vertex GROUP BY a.vertex
      ),UNNEST(closest) AS t(item)`;
    await connection.run(`INSERT INTO ${names.candidates} ${query}`);
  }
}
