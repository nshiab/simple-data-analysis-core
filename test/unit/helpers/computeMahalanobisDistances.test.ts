import { assertAlmostEquals, assertEquals, assertRejects } from "@std/assert";
import { DuckDBInstance } from "@duckdb/node-api";
import computeMahalanobisDistances from "../../../src/helpers/computeMahalanobisDistances.ts";
import { factorCovariance } from "../../../src/helpers/factorCovariance.ts";

Deno.test("distance scratch tables are cleaned on success and numerical failure", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  const model = {
    ...factorCovariance([1], 1),
    observations: 3,
    means: new Float64Array([0]),
    origins: new Float64Array([0]),
    meanOffsets: new Float64Array([0]),
  };
  const input = {
    relation: 'source " rows',
    rowIdColumn: 'row " id',
    vectorColumn: 'vector " values',
  };
  try {
    await connection.run(`CREATE TEMP TABLE "source "" rows" AS
      SELECT i AS "row "" id", [i::DOUBLE]::DOUBLE[1] AS "vector "" values" FROM range(3) source(i)`);
    const result = await computeMahalanobisDistances(connection, input, model);
    const rows = (await connection.runAndReadAll(
      `SELECT distance FROM "${result.relation}" ORDER BY row_id`,
    )).getRowsJS().flat().map(Number);
    assertEquals(rows, [0, 1, 2]);
    await result.cleanup();
    await result.cleanup();
    await connection.run(
      `UPDATE "source "" rows" SET "vector "" values" = [1e308]::DOUBLE[1]`,
    );
    await assertRejects(
      () => computeMahalanobisDistances(connection, input, model),
      Error,
      "non-finite",
    );
    const scratch = (await connection.runAndReadAll(
      `SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '__sda_mahalanobis_%'`,
    )).getRowsJS();
    assertEquals(scratch, []);
    await assertRejects(
      () =>
        computeMahalanobisDistances(connection, input, {
          ...model,
          meanOffsets: new Float64Array([Infinity]),
        }),
      Error,
      "finite",
    );
    await assertRejects(
      () =>
        computeMahalanobisDistances(connection, input, {
          ...model,
          means: new Float64Array(0),
        }),
      Error,
      "dimensions",
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("distance supports the smallest positive variance without an explicit covariance inverse", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    const variance = Number.MIN_VALUE;
    const model = {
      ...factorCovariance([variance], 1),
      observations: 2,
      means: new Float64Array([0]),
      origins: new Float64Array([0]),
      meanOffsets: new Float64Array([0]),
    };
    await connection.run(
      `CREATE TEMP TABLE prepared AS SELECT 1 AS row_id, [${
        Math.sqrt(variance)
      }]::DOUBLE[1] AS vec`,
    );
    const result = await computeMahalanobisDistances(connection, {
      relation: "prepared",
      rowIdColumn: "row_id",
      vectorColumn: "vec",
    }, model);
    const distance = Number(
      (await connection.runAndReadAll(
        `SELECT distance FROM "${result.relation}"`,
      )).getRowsJS()[0][0],
    );
    assertAlmostEquals(distance, 1, 1e-14);
    await result.cleanup();
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
