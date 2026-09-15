import { resourceUsage } from "node:process";
import SimpleDB from "../../src/class/SimpleDB.ts";

const rows = Number(Deno.args[0]);
const dimensions = Number(Deno.args[1]);
if (
  !Number.isSafeInteger(rows) || !Number.isSafeInteger(dimensions) ||
  dimensions < 1 || rows <= dimensions
) {
  throw new Error(
    "Usage: worker.ts ROWS DIMENSIONS, with ROWS > DIMENSIONS >= 1",
  );
}

const sdb = new SimpleDB();
try {
  await sdb.customQuery(
    "SET threads=1; SET enable_external_file_cache=false",
  );
  await sdb.customQuery(`CREATE TABLE source AS
    SELECT observation::INTEGER AS id,
      list_transform(range(0, ${dimensions}), feature ->
        sin((observation + 1) * (feature + 1) * 0.017453292519943295) +
        cos((observation + 3) * (feature + 5) * 0.011180339887498949) +
        CASE WHEN feature = observation % ${dimensions} THEN 0.25 ELSE 0 END
      )::DOUBLE[${dimensions}] AS features
    FROM range(${rows}) source(observation)`);
  const table = sdb.newTable("source");

  console.error(JSON.stringify({ phase: "source-ready" }));
  const started = performance.now();
  await table.mahalanobis("features", "distance").run();
  const publicMethodMilliseconds = performance.now() - started;
  console.error(
    JSON.stringify({ phase: "public-method", publicMethodMilliseconds }),
  );

  const aggregate = (await sdb.connection!.runAndReadAll(
    `SELECT sum(distance * distance),
      count(*) FILTER (WHERE isfinite(distance)),
      count(*) FILTER (WHERE id = expected_id)
     FROM (SELECT *, row_number() OVER () - 1 AS expected_id FROM source)`,
  )).getRowsJS()[0];
  const squaredDistanceSum = Number(aggregate[0]);
  const finiteDistances = Number(aggregate[1]);
  const orderedRows = Number(aggregate[2]);
  const expectedSquaredDistanceSum = (rows - 1) * dimensions;
  const relativeIdentityError = Math.abs(
    squaredDistanceSum - expectedSquaredDistanceSum,
  ) / expectedSquaredDistanceSum;
  const types = await table.getTypes();
  const scratchRelations = Number(
    (await sdb.connection!.runAndReadAll(
      `SELECT count(*) FROM duckdb_tables()
       WHERE table_name LIKE '__sda_features_%'
          OR table_name LIKE '__sda_mahalanobis_%'`,
    )).getRowsJS()[0][0],
  );
  if (
    finiteDistances !== rows || orderedRows !== rows ||
    types.features !== `DOUBLE[${dimensions}]` || types.distance !== "DOUBLE" ||
    scratchRelations !== 0 || !Number.isFinite(relativeIdentityError) ||
    relativeIdentityError > 1e-8
  ) {
    throw new Error(
      `Public-method verification failed: identity error ${relativeIdentityError}; finite rows ${finiteDistances}/${rows}; ordered rows ${orderedRows}/${rows}; scratch relations ${scratchRelations}.`,
    );
  }
  const duckdbVersion = String(
    (await sdb.connection!.runAndReadAll("SELECT version()"))
      .getRowsJS()[0][0],
  );

  console.log(JSON.stringify({
    rows,
    dimensions,
    publicMethodMilliseconds,
    processHighWaterRssBytes: resourceUsage().maxRSS *
      (Deno.build.os === "darwin" ? 1 : 1024),
    sourceVectorPayloadBytes: rows * dimensions * 8,
    finiteDistances,
    orderedRows,
    squaredDistanceSum,
    expectedSquaredDistanceSum,
    relativeIdentityError,
    scratchRelations,
    duckdbVersion,
  }));
} finally {
  await sdb.close();
}
