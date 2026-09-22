import { resourceUsage } from "node:process";
import SimpleDB from "../../src/class/SimpleDB.ts";

type Metric = "euclidean" | "cosine";
type Payload = "narrow" | "wide";

const argument = (name: string, fallback?: string): string => {
  const index = Deno.args.indexOf(`--${name}`);
  const value = index < 0 ? fallback : Deno.args[index + 1];
  if (value === undefined) throw new Error(`Missing --${name}.`);
  return value;
};
const rows = Number(argument("rows"));
const dimensions = Number(argument("dimensions"));
const minClusterSize = Number(argument("min-cluster-size", "25"));
const minSamples = Number(argument("min-samples", "15"));
const metric = argument("metric", "euclidean") as Metric;
const approximate = argument("approximate", "true") === "true";
const payload = argument("payload", "narrow") as Payload;
if (
  !Number.isSafeInteger(rows) || rows < 2 ||
  !Number.isSafeInteger(dimensions) || dimensions < 1 ||
  !Number.isSafeInteger(minClusterSize) || minClusterSize < 2 ||
  minClusterSize > rows ||
  !Number.isSafeInteger(minSamples) || minSamples < 1 || minSamples >= rows ||
  !["euclidean", "cosine"].includes(metric) ||
  !["narrow", "wide"].includes(payload) ||
  !["true", "false"].includes(argument("approximate", "true"))
) throw new Error("Invalid HDBSCAN benchmark arguments.");

const sdb = new SimpleDB();
try {
  await sdb.customQuery("SET threads=8; SET enable_external_file_cache=false");
  const wideColumns = payload === "wide"
    ? `,repeat(md5(i::VARCHAR),64) AS text_payload,
       (123456789.123456789::DECIMAL(18,9)+(i%1000)) AS decimal_payload,
       DATE '2020-01-01'+(i%365)::INTEGER AS date_payload,
       {'group': (i%8)::INTEGER, 'retained': true} AS struct_payload`
    : "";
  const vector = `list_transform(range(0,${dimensions}),j ->
    (2.0 + sin(((i%8)+1)*(j+1)*0.17320508075688773)
      + cos(((i%8)+3)*(j+2)*0.10101525445522107)
      + 0.01*sin((i+1)*(j+1)*0.000123))::DOUBLE
  )::DOUBLE[${dimensions}]`;
  await sdb.customQuery(`CREATE TABLE source AS
    SELECT i::INTEGER AS id,${vector} AS features${wideColumns}
    FROM range(0,${rows}) source(i)`);
  const table = sdb.newTable("source");
  const payloadHash = payload === "wide"
    ? String(
      (await sdb.connection!.runAndReadAll(
        "SELECT bit_xor(hash(id,text_payload,decimal_payload,date_payload,struct_payload)) FROM source",
      )).getRowsJS()[0][0],
    )
    : undefined;

  console.error(JSON.stringify({ phase: "source-ready" }));
  const started = performance.now();
  await table.hdbscan("features", "cluster", {
    minClusterSize,
    minSamples,
    metric,
    approximate,
    probabilityColumn: "membership",
    outlierScoreColumn: "outlier",
  }).run();
  const publicMethodMilliseconds = performance.now() - started;
  console.error(
    JSON.stringify({ phase: "public-method", publicMethodMilliseconds }),
  );

  const [
    rowCount,
    orderedRows,
    finiteMembership,
    finiteOutliers,
    noiseRows,
    clusterCount,
  ] = (await sdb.connection!.runAndReadAll(
    `SELECT count(*),count(*) FILTER (WHERE id=expected_id),
        count(*) FILTER (WHERE isfinite(membership)),
        count(*) FILTER (WHERE isfinite(outlier)),
        count(*) FILTER (WHERE cluster=-1),
        count(DISTINCT cluster) FILTER (WHERE cluster>=0)
       FROM (SELECT *,row_number() OVER ()-1 AS expected_id FROM source)`,
  )).getRowsJS()[0].map(Number);
  const afterPayloadHash = payload === "wide"
    ? String(
      (await sdb.connection!.runAndReadAll(
        "SELECT bit_xor(hash(id,text_payload,decimal_payload,date_payload,struct_payload)) FROM source",
      )).getRowsJS()[0][0],
    )
    : undefined;
  const types = await table.getTypes();
  const scratchObjects = Number(
    (await sdb.connection!.runAndReadAll(
      `SELECT count(*) FROM (
        SELECT table_name AS name FROM duckdb_tables()
        WHERE table_name LIKE '__sda_features_%'
           OR table_name LIKE '__sda_hdbscan_%'
        UNION ALL
        SELECT index_name FROM duckdb_indexes()
        WHERE index_name LIKE '__sda_hdbscan_%')`,
    )).getRowsJS()[0][0],
  );
  if (
    rowCount !== rows || orderedRows !== rows || finiteMembership !== rows ||
    finiteOutliers !== rows || types.features !== `DOUBLE[${dimensions}]` ||
    types.cluster !== "INTEGER" || types.membership !== "DOUBLE" ||
    types.outlier !== "DOUBLE" || scratchObjects !== 0 ||
    payloadHash !== afterPayloadHash
  ) {
    throw new Error(
      `Public-method verification failed: rows ${rowCount}/${rows}; ordered ${orderedRows}/${rows}; finite membership ${finiteMembership}/${rows}; finite GLOSH ${finiteOutliers}/${rows}; scratch ${scratchObjects}; payload preserved ${
        payloadHash === afterPayloadHash
      }.`,
    );
  }
  // Canonicalize clusters by their first source row before hashing. This
  // detects changed partitions independently of incidental numeric labels.
  const outputHashes = (await sdb.connection!.runAndReadAll(`
    WITH canonical AS (
      SELECT id,cluster,membership,outlier,
        min(id) OVER (PARTITION BY cluster) AS first_member
      FROM source
    )
    SELECT sha256(string_agg(CASE WHEN cluster<0 THEN '-1' ELSE first_member::VARCHAR END,',' ORDER BY id)),
      sha256(string_agg((cluster<0)::VARCHAR,',' ORDER BY id)),
      sha256(string_agg(membership::VARCHAR,',' ORDER BY id)),
      sha256(string_agg(outlier::VARCHAR,',' ORDER BY id))
    FROM canonical`)).getRowsJS()[0].map(String);
  const duckdbVersion = String(
    (await sdb.connection!.runAndReadAll("SELECT version()"))
      .getRowsJS()[0][0],
  );
  console.log(JSON.stringify({
    rows,
    dimensions,
    metric,
    approximate,
    payload,
    minClusterSize,
    minSamples,
    publicMethodMilliseconds,
    processHighWaterRssBytes: resourceUsage().maxRSS *
      (Deno.build.os === "darwin" ? 1 : 1024),
    sourceVectorPayloadBytes: rows * dimensions * 8,
    rowCount,
    orderedRows,
    finiteMembership,
    finiteOutliers,
    noiseRows,
    clusterCount,
    scratchObjects,
    partitionHash: outputHashes[0],
    noiseHash: outputHashes[1],
    membershipHash: outputHashes[2],
    gloshHash: outputHashes[3],
    payloadHash,
    duckdbVersion,
  }));
} finally {
  await sdb.close();
}
