import { DuckDBInstance } from "@duckdb/node-api";
import buildVectorNeighbors from "../../src/helpers/buildVectorNeighbors.ts";
import buildExactMutualReachabilityMst from "../../src/helpers/buildExactMutualReachabilityMst.ts";
import inspectGraphConnectivity from "../../src/helpers/inspectGraphConnectivity.ts";

type Metric = "euclidean" | "cosine";
type Search = "exact" | "hnsw";
type Operation = "neighbors" | "exact-mst" | "compare-neighbors";

const argument = (name: string, fallback?: string) => {
  const index = Deno.args.indexOf(`--${name}`);
  const value = index < 0 ? fallback : Deno.args[index + 1];
  if (value === undefined) throw new Error(`Missing --${name}.`);
  return value;
};
const rows = Number(argument("rows"));
const dimensions = Number(argument("dimensions"));
const neighbors = Number(argument("neighbors", "15"));
const metric = argument("metric", "euclidean") as Metric;
const search = argument("search", "hnsw") as Search;
const operation = argument("operation", "neighbors") as Operation;
const payload = argument("payload", "narrow") as "narrow" | "wide";
if (
  !Number.isSafeInteger(rows) || rows < 2 ||
  !Number.isSafeInteger(dimensions) || dimensions < 1 ||
  !Number.isSafeInteger(neighbors) || neighbors < 1 || neighbors >= rows ||
  !["euclidean", "cosine"].includes(metric) ||
  !["exact", "hnsw"].includes(search) ||
  !["neighbors", "exact-mst", "compare-neighbors"].includes(operation) ||
  !["narrow", "wide"].includes(payload)
) throw new Error("Invalid benchmark arguments.");

const started = performance.now();
const db = await DuckDBInstance.create(":memory:");
const connection = await db.connect();
try {
  await connection.run("SET threads=8");
  const duckdbVersion = String(
    (await connection.runAndReadAll("SELECT version()")).getRowsJS()[0][0],
  );
  if (payload === "wide") await connection.run("INSTALL spatial; LOAD spatial");
  const wideColumns = payload === "wide"
    ? `,repeat(md5(i::VARCHAR),64) AS text_payload,
       ST_Point((i%360)::DOUBLE,(i%180)::DOUBLE) AS geometry_payload`
    : "";
  const vector = `list_transform(range(0,${dimensions}),j ->
    (sin((i+1)*(j+1)*0.000123)+cos((i+3)*(j+2)*0.000071)+2)::DOUBLE
  )::DOUBLE[${dimensions}]`;
  await connection.run(`CREATE TEMP TABLE source AS
    SELECT i::INTEGER AS vertex,${vector} AS vec${wideColumns}
    FROM range(0,${rows}) t(i)`);
  const sourceReadyMs = performance.now() - started;
  // Reproduce UMAP's full payload snapshot, then make the vector-only relation
  // consumed by shared analysis helpers.
  await connection.run(`CREATE TEMP TABLE snapshot AS SELECT * FROM source;
    CREATE TEMP TABLE vectors AS SELECT vertex,vec FROM snapshot ORDER BY vertex`);
  const preparedMs = performance.now() - started;

  const names = (prefix: string) => ({
    rows: '"vectors"',
    neighbors: `"${prefix}_neighbors"`,
    search: `"${prefix}_search"`,
    hnsw: `"${prefix}_hnsw"`,
    candidates: `"${prefix}_candidates"`,
  });
  let details: Record<string, unknown>;
  if (operation === "exact-mst") {
    await buildExactMutualReachabilityMst(
      connection,
      { count: rows, minSamples: neighbors },
      { metric },
      {
        rows: '"vectors"',
        coreDistances: '"core_distances"',
        frontier: '"mst_frontier"',
        mst: '"mst"',
      },
    );
    details = {
      edges: Number(
        (await connection.runAndReadAll("SELECT count(*) FROM mst"))
          .getRowsJS()[0][0],
      ),
    };
  } else if (operation === "compare-neighbors") {
    await buildVectorNeighbors(
      connection,
      { count: rows, dimensions, neighborCount: neighbors },
      { metric, search: "exact", includeSelf: false },
      names("exact"),
    );
    await buildVectorNeighbors(
      connection,
      { count: rows, dimensions, neighborCount: neighbors },
      { metric, search: "hnsw", includeSelf: false },
      names("approx"),
    );
    const [matches, total, meanError] = (await connection.runAndReadAll(
      `SELECT count(a.target),count(*),avg(abs(a.distance-e.distance))
       FROM exact_neighbors e LEFT JOIN approx_neighbors a USING(source,rank)`,
    )).getRowsJS()[0];
    const sameTargets = Number(
      (await connection.runAndReadAll(
        `SELECT count(*) FROM exact_neighbors e JOIN approx_neighbors a
         USING(source,target)`,
      )).getRowsJS()[0][0],
    );
    const connectivity = await inspectGraphConnectivity(
      connection,
      '"approx_neighbors"',
      rows,
    );
    details = {
      rankDistancePairs: Number(matches),
      total: Number(total),
      neighborRecall: sameTargets / Number(total),
      meanSameRankDistanceError: Number(meanError),
      approximateEdgeHash: String(
        (await connection.runAndReadAll(
          "SELECT bit_xor(hash(source,target,rank,distance)) FROM approx_neighbors",
        )).getRowsJS()[0][0],
      ),
      connectivity,
    };
  } else {
    const neighborNames = names("bench");
    await buildVectorNeighbors(
      connection,
      { count: rows, dimensions, neighborCount: neighbors },
      { metric, search, includeSelf: false },
      neighborNames,
    );
    const connectivity = await inspectGraphConnectivity(
      connection,
      neighborNames.neighbors,
      rows,
    );
    details = {
      edges: Number(
        (await connection.runAndReadAll(
          `SELECT count(*) FROM ${neighborNames.neighbors}`,
        )).getRowsJS()[0][0],
      ),
      edgeHash: String(
        (await connection.runAndReadAll(
          `SELECT bit_xor(hash(source,target,rank,distance))
           FROM ${neighborNames.neighbors}`,
        )).getRowsJS()[0][0],
      ),
      connectivity,
    };
  }
  console.log(JSON.stringify({
    status: "completed",
    rows,
    dimensions,
    neighbors,
    metric,
    search: operation === "exact-mst" ? "exact" : search,
    operation,
    payload,
    sourceReadyMs,
    preparedMs,
    elapsedMs: performance.now() - started,
    software: { deno: Deno.version.deno, duckdb: duckdbVersion },
    details,
  }));
} finally {
  connection.closeSync();
  db.closeSync();
}
