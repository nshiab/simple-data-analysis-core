import { DuckDBInstance } from "@duckdb/node-api";
import buildVectorNeighbors from "../../src/helpers/buildVectorNeighbors.ts";

// Isolate candidate retrieval from MST repair and hierarchy selection. Change
// one retrieval setting at a time on near-collinear benchmark vectors.
const count = 2048;
const dimensions = 128;
const neighborCount = 15;
const defaults = {
  efConstruction: 128,
  efSearch: 128,
  connectivity: 16,
  candidateCount: 16,
  singleThreaded: false,
  cosineAsL2: false,
};
const cases = [
  { name: "original-settings", settings: defaults },
  {
    name: "serialized-construction-only",
    settings: { ...defaults, singleThreaded: true },
  },
  { name: "unit-l2-only", settings: { ...defaults, cosineAsL2: true } },
  {
    name: "higher-search-effort-only",
    settings: { ...defaults, efSearch: 512 },
  },
  {
    name: "wider-reranking-only",
    settings: { ...defaults, candidateCount: 129 },
  },
  {
    name: "combined",
    settings: {
      efConstruction: 256,
      efSearch: 512,
      connectivity: 32,
      candidateCount: 129,
      singleThreaded: true,
      cosineAsL2: true,
    },
  },
];
const db = await DuckDBInstance.create(":memory:");
const connection = await db.connect();
try {
  await connection.run(`SET threads=8;
    CREATE TEMP TABLE rows AS
    SELECT vertex::INTEGER AS vertex,list_transform(range(0,${dimensions}),j ->
      (2.0 + sin(((i%8)+1)*(j+1)*0.17320508075688773)
        + cos(((i%8)+3)*(j+2)*0.10101525445522107)
        + 0.01*sin((i+1)*(j+1)*0.000123))::DOUBLE
    )::DOUBLE[${dimensions}] AS vec
    FROM (SELECT vertex,floor(vertex*100000.0/${count})::INTEGER AS i FROM range(${count}) t(vertex))`);
  const names = {
    rows: '"rows"',
    neighbors: '"neighbors"',
    search: '"search"',
    hnsw: '"hnsw"',
    candidates: '"candidates"',
  };
  await buildVectorNeighbors(connection, { count, dimensions, neighborCount }, {
    metric: "cosine",
    search: "exact",
    includeSelf: false,
  }, names);
  await connection.run("CREATE TEMP TABLE exact AS SELECT * FROM neighbors");
  const results = [];
  for (const { name, settings } of cases) {
    const repetitions = [];
    for (let repeat = 0; repeat < 3; repeat++) {
      const started = performance.now();
      await buildVectorNeighbors(connection, {
        count,
        dimensions,
        neighborCount,
      }, {
        metric: "cosine",
        search: "hnsw",
        includeSelf: false,
        hnsw: settings,
      }, names);
      const [matched, maxCoreError, meanCoreError, neighborHash] =
        (await connection.runAndReadAll(`
        SELECT (SELECT count(*) FROM neighbors n JOIN exact e USING(source,target)),
          (SELECT max(abs(n.distance-e.distance)) FROM neighbors n JOIN exact e USING(source,rank) WHERE n.rank=${
          neighborCount - 1
        }),
          (SELECT avg(abs(n.distance-e.distance)) FROM neighbors n JOIN exact e USING(source,rank) WHERE n.rank=${
          neighborCount - 1
        }),
          (SELECT sha256(string_agg(source::VARCHAR||':'||target::VARCHAR||':'||distance::VARCHAR,',' ORDER BY source,rank)) FROM neighbors)`))
          .getRowsJS()[0];
      repetitions.push({
        repeat,
        elapsedMs: performance.now() - started,
        recall: Number(matched) / (count * neighborCount),
        maxCoreError: Number(maxCoreError),
        meanCoreError: Number(meanCoreError),
        neighborHash: String(neighborHash),
      });
      await connection.run("DROP TABLE search");
    }
    results.push({ name, settings, repetitions });
  }
  console.log(JSON.stringify(
    {
      measuredAt: new Date().toISOString(),
      count,
      dimensions,
      neighborCount,
      metric: "cosine",
      threads: 8,
      deno: Deno.version.deno,
      duckdb: String(
        (await connection.runAndReadAll("SELECT version()")).getRowsJS()[0][0],
      ),
      dataset:
        "2048 evenly spaced ids from the 100000-row 128d cosine benchmark, SQL DOUBLE",
      results,
    },
    null,
    2,
  ));
} finally {
  connection.closeSync();
  db.closeSync();
}
