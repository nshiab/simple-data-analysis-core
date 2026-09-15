import type { DuckDBConnection } from "@duckdb/node-api";
import readScalarNumber from "./readScalarNumber.ts";
import vectorDistanceExpression from "./vectorDistanceExpression.ts";
import validateVectorRowIds from "./validateVectorRowIds.ts";

/** Private, already-quoted relation names owned and cleaned up by the caller. */
export type MutualReachabilityTables = {
  rows: string;
  coreDistances: string;
  frontier: string;
  mst: string;
};

/**
 * Build an exact HDBSCAN mutual-reachability MST with bounded materialization.
 *
 * The prepared rows relation must contain contiguous INTEGER `vertex` ids and
 * fixed-size DOUBLE `vec` values. `minSamples` excludes the point itself. Core
 * distance calculation uses bounded top-k aggregates and retains one scalar per
 * point. Prim's algorithm retains one frontier edge per unvisited point. This
 * costs O(n²d) distance work, O(n) stored algorithm state, and O(n) sequential
 * DuckDB statements; it is intended as the exact correctness baseline.
 * All supplied scratch names are already quoted, distinct, and caller-owned;
 * the caller must drop them in finally on both success and failure.
 */
export default async function buildExactMutualReachabilityMst(
  connection: DuckDBConnection,
  input: { count: number; minSamples: number },
  options: { metric: "euclidean" | "cosine" },
  names: MutualReachabilityTables,
): Promise<void> {
  const { count, minSamples } = input;
  if (count < 2 || !Number.isSafeInteger(count)) {
    throw new Error(
      "Exact mutual-reachability MST requires at least two rows.",
    );
  }
  if (
    !Number.isSafeInteger(minSamples) || minSamples < 1 || minSamples >= count
  ) {
    throw new Error(
      `minSamples must be a safe integer between 1 and ${count - 1}.`,
    );
  }
  await validateVectorRowIds(connection, names.rows, count);
  if (
    await readScalarNumber(
      connection,
      `SELECT count(*) FROM ${names.rows}
       WHERE NOT isfinite(array_inner_product(vec,vec))
       ${
        options.metric === "cosine" ? "OR array_inner_product(vec,vec)=0" : ""
      }`,
    )
  ) {
    throw new Error(
      options.metric === "cosine"
        ? "Exact HDBSCAN requires finite vector norms and cosine distance requires nonzero vectors."
        : "Exact HDBSCAN requires finite vector norms.",
    );
  }
  const distance = vectorDistanceExpression("a.vec", "b.vec", options.metric);
  await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.coreDistances}
    (vertex INTEGER PRIMARY KEY,distance DOUBLE)`);
  for (let offset = 0; offset < count; offset += 32) {
    await connection.run(`INSERT INTO ${names.coreDistances}
      SELECT source,max(item.distance)::DOUBLE AS distance FROM (
        SELECT a.vertex AS source,
          CASE WHEN bool_and(isfinite(${distance})) THEN
          min_by(struct_pack(target := b.vertex,distance := ${distance}),
            struct_pack(distance := ${distance},target := b.vertex),
            ${minSamples}) ELSE error('Distance computation returned a non-finite value.') END AS closest
        FROM ${names.rows} a CROSS JOIN ${names.rows} b
        WHERE a.vertex >= ${offset} AND a.vertex < ${offset + 32}
          AND a.vertex != b.vertex GROUP BY a.vertex
      ),UNNEST(closest) AS t(item) GROUP BY source`);
  }
  if (
    await readScalarNumber(
      connection,
      `SELECT count(*) FROM ${names.coreDistances}
        WHERE NOT isfinite(distance)`,
    ) ||
    await readScalarNumber(
        connection,
        `SELECT count(*) FROM ${names.coreDistances}`,
      ) !== count
  ) {
    throw new Error(
      "Exact core-distance computation returned missing or non-finite values.",
    );
  }

  const root = await readScalarNumber(
    connection,
    `SELECT min(vertex) FROM ${names.rows}`,
  );
  await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.frontier} AS
    SELECT b.vertex,${root}::INTEGER AS parent,
      greatest(ca.distance,cb.distance,${distance})::DOUBLE AS distance
    FROM ${names.rows} a CROSS JOIN ${names.rows} b
    JOIN ${names.coreDistances} ca ON ca.vertex=a.vertex
    JOIN ${names.coreDistances} cb ON cb.vertex=b.vertex
    WHERE a.vertex=${root} AND b.vertex!=${root};
    CREATE OR REPLACE TEMP TABLE ${names.mst}
      (source INTEGER,target INTEGER,distance DOUBLE)`);

  for (let edge = 0; edge < count - 1; edge++) {
    const chosen = (await connection.runAndReadAll(
      `SELECT vertex,parent,distance FROM ${names.frontier}
       ORDER BY distance,least(parent,vertex),greatest(parent,vertex),parent,vertex
       LIMIT 1`,
    )).getRowsJS()[0];
    if (chosen === undefined) {
      throw new Error("Exact mutual-reachability graph became disconnected.");
    }
    const vertex = Number(chosen[0]);
    const parent = Number(chosen[1]);
    const edgeDistance = Number(chosen[2]);
    if (!Number.isFinite(edgeDistance)) {
      throw new Error(
        "Exact mutual-reachability MST returned a non-finite distance.",
      );
    }
    await connection.run(`INSERT INTO ${names.mst} VALUES
      (${Math.min(vertex, parent)},${
      Math.max(vertex, parent)
    },${edgeDistance})`);
    if (edge === count - 2) break;
    const candidateDistance = vectorDistanceExpression(
      "added.vec",
      "target.vec",
      options.metric,
    );
    await connection.run(`CREATE OR REPLACE TEMP TABLE ${names.frontier} AS
      WITH candidates AS (
        SELECT f.*,greatest(ca.distance,cb.distance,${candidateDistance})::DOUBLE
          AS candidate_distance
        FROM ${names.frontier} f
        JOIN ${names.rows} target ON target.vertex=f.vertex
        CROSS JOIN ${names.rows} added
        JOIN ${names.coreDistances} ca ON ca.vertex=added.vertex
        JOIN ${names.coreDistances} cb ON cb.vertex=target.vertex
        WHERE added.vertex=${vertex} AND f.vertex!=${vertex}
      )
      SELECT vertex,
        CASE WHEN candidate_distance<distance OR
          (candidate_distance=distance AND ${vertex}<parent)
          THEN ${vertex} ELSE parent END::INTEGER AS parent,
        least(distance,candidate_distance)::DOUBLE AS distance
      FROM candidates`);
  }
}
