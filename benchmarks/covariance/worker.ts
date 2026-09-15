import { DuckDBInstance } from "@duckdb/node-api";
import buildMahalanobisDistanceSql from "../../src/helpers/buildMahalanobisDistanceSql.ts";
import computeCovariance from "../../src/helpers/computeCovariance.ts";
import { factorCovariance } from "../../src/helpers/factorCovariance.ts";

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

const db = await DuckDBInstance.create(":memory:");
const connection = await db.connect();
await connection.run("SET threads=1; SET enable_external_file_cache=false");
await connection.run(`CREATE TEMP TABLE prepared AS
  SELECT observation::INTEGER AS row_id,
    list_transform(range(0, ${dimensions}), feature ->
      sin((observation + 1) * (feature + 1) * 0.017453292519943295) +
      cos((observation + 3) * (feature + 5) * 0.011180339887498949) +
      CASE WHEN feature = observation % ${dimensions} THEN 0.25 ELSE 0 END
    )::DOUBLE[${dimensions}] AS vec
  FROM range(${rows}) source(observation)`);

const startCovariance = performance.now();
const model = await computeCovariance(connection, {
  relation: "prepared",
  rowIdColumn: "row_id",
  vectorColumn: "vec",
  observations: rows,
  dimensions,
});
const covarianceMilliseconds = performance.now() - startCovariance;
const afterCovarianceRss = Deno.memoryUsage().rss;

const startMatrix = performance.now();
const refactor = factorCovariance(model.covariance, dimensions);
const matrixMilliseconds = performance.now() - startMatrix;

const distance = buildMahalanobisDistanceSql("vec", model);
const distanceSqlUtf8Bytes = new TextEncoder().encode(distance).length;
const startDistance = performance.now();
const aggregate = (await connection.runAndReadAll(
  `SELECT sum(distance * distance), count(*) FILTER (WHERE isfinite(distance))
   FROM (SELECT ${distance} AS distance FROM prepared)`,
)).getRowsJS()[0];
const distanceMilliseconds = performance.now() - startDistance;
const squaredDistanceSum = Number(aggregate[0]);
const finiteDistances = Number(aggregate[1]);
const expectedSquaredDistanceSum = (rows - 1) * dimensions;
const relativeIdentityError = Math.abs(
  squaredDistanceSum - expectedSquaredDistanceSum,
) / expectedSquaredDistanceSum;
const version = String(
  (await connection.runAndReadAll("SELECT version()"))
    .getRowsJS()[0][0],
);

console.log(JSON.stringify({
  rows,
  dimensions,
  covarianceMilliseconds,
  matrixMilliseconds,
  distanceMilliseconds,
  afterCovarianceRssBytes: afterCovarianceRss,
  sourceVectorPayloadBytes: rows * dimensions * 8,
  modelMatrixBytes: 2 * dimensions * dimensions * 8 +
    4 * dimensions * 8,
  refactorMatrixBytes: 2 * dimensions * dimensions * 8 + dimensions * 8,
  temporaryWhiteningBytes: dimensions * dimensions * 8,
  distanceSqlUtf8Bytes,
  distanceSqlUtf16Bytes: distance.length * 2,
  reciprocalCondition: refactor.reciprocalCondition,
  finiteDistances,
  squaredDistanceSum,
  expectedSquaredDistanceSum,
  relativeIdentityError,
  duckdbVersion: version,
}));

connection.closeSync();
db.closeSync();
