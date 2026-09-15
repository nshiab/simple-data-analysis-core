import { assertAlmostEquals, assertEquals, assertRejects } from "@std/assert";
import { DuckDBInstance } from "@duckdb/node-api";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import buildMahalanobisDistanceSql from "../../../src/helpers/buildMahalanobisDistanceSql.ts";
import computeCovariance from "../../../src/helpers/computeCovariance.ts";
import { solveCovariance } from "../../../src/helpers/factorCovariance.ts";
import prepareNumericFeatures from "../../../src/helpers/prepareNumericFeatures.ts";

type Fixture = {
  numpyVersion: string;
  data: number[][];
  means: number[];
  sampleCovariance: number[][];
  rightHandSide: number[];
  solve: number[];
  distances: number[];
  squaredDistanceSum: number;
};

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../fixtures/covariance/numpy-2.3.4.json", import.meta.url),
  ),
) as Fixture;

function assertCloseArray(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  tolerance = 1e-12,
) {
  assertEquals(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) {
    assertAlmostEquals(actual[i], expected[i], tolerance);
  }
}

Deno.test("DuckDB means, sample covariance, solves, and distances match NumPy 2.3.4", async () => {
  assertEquals(fixture.numpyVersion, "2.3.4");
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(
      "CREATE TEMP TABLE prepared(row_id INTEGER, vec DOUBLE[3])",
    );
    await connection.run(
      `INSERT INTO prepared VALUES ${
        fixture.data.map((values, row) =>
          `(${row}, [${values.join(",")}]::DOUBLE[3])`
        ).join(",")
      }`,
    );
    const model = await computeCovariance(connection, {
      relation: "prepared",
      rowIdColumn: "row_id",
      vectorColumn: "vec",
      observations: fixture.data.length,
      dimensions: 3,
    });
    assertCloseArray(model.means, fixture.means);
    assertCloseArray(model.covariance, fixture.sampleCovariance.flat());
    assertCloseArray(
      solveCovariance(model, fixture.rightHandSide),
      fixture.solve,
      1e-11,
    );

    const expression = buildMahalanobisDistanceSql("vec", model);
    const rows = (await connection.runAndReadAll(
      `SELECT ${expression} AS distance FROM prepared ORDER BY row_id`,
    )).getRowsJS();
    const distances = rows.map((row) => Number(row[0]));
    assertCloseArray(distances, fixture.distances, 1e-11);
    const squaredSum = distances.reduce(
      (sum, distance) => sum + distance * distance,
      0,
    );
    // Same-sample identity: sum(distance²) = (n - 1) * d.
    assertAlmostEquals(squaredSum, (fixture.data.length - 1) * 3, 1e-10);
    assertAlmostEquals(squaredSum, fixture.squaredDistanceSum, 1e-10);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("covariance consumes shared mixed-scalar feature preparation", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TEMP TABLE source AS SELECT * FROM (VALUES
      (1::TINYINT, 2.5::DECIMAL(4,1)),
      (2::TINYINT, 5.0::DECIMAL(4,1)),
      (4::TINYINT, 3.5::DECIMAL(4,1)),
      (7::TINYINT, 9.0::DECIMAL(4,1))
    ) rows(count, score)`);
    const prepared = await prepareNumericFeatures(
      sdb.newTable("source"),
      { kind: "scalars", columns: ["count", "score"] },
      { method: "mahalanobis()" },
    );
    try {
      const model = await computeCovariance(sdb.connection!, {
        relation: prepared.relation,
        rowIdColumn: prepared.rowIdColumn,
        vectorColumn: prepared.vectorColumn,
        observations: prepared.rowCount,
        dimensions: prepared.dimensions,
      });
      assertCloseArray(model.means, [3.5, 5]);
      assertCloseArray(model.covariance, [7, 6.5, 6.5, 8.166666666666666]);
    } finally {
      await prepared.cleanup();
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("sample covariance remains stable after a large translation", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE base AS SELECT i::INTEGER AS row_id,
      list_value(x, y)::DOUBLE[2] AS vec FROM (VALUES
      (0, 1, 2), (1, 2, 5), (2, 4, 3), (3, 5, 8), (4, 7, 6)
      ) t(i, x, y)`);
    await connection.run(`CREATE TEMP TABLE translated AS SELECT row_id,
      list_value(vec[1] + 1e12, vec[2] - 1e12)::DOUBLE[2] AS vec FROM base`);
    const calculate = (relation: string) =>
      computeCovariance(connection, {
        relation,
        rowIdColumn: "row_id",
        vectorColumn: "vec",
        observations: 5,
        dimensions: 2,
      });
    const original = await calculate("base");
    const translated = await calculate("translated");
    assertCloseArray(translated.covariance, original.covariance, 1e-12);

    const baseDistances = (await connection.runAndReadAll(
      `SELECT ${
        buildMahalanobisDistanceSql("vec", original)
      } FROM base ORDER BY row_id`,
    )).getRowsJS().flat().map(Number);
    const translatedDistances = (await connection.runAndReadAll(
      `SELECT ${
        buildMahalanobisDistanceSql("vec", translated)
      } FROM translated ORDER BY row_id`,
    )).getRowsJS().flat().map(Number);
    assertCloseArray(translatedDistances, baseDistances, 1e-10);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("one-dimensional distance is the absolute sample z-score", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE prepared AS SELECT i AS row_id,
      [x]::DOUBLE[1] AS vec FROM (VALUES (0, 1), (1, 2), (2, 6), (3, 7)) t(i, x)`);
    const model = await computeCovariance(connection, {
      relation: "prepared",
      rowIdColumn: "row_id",
      vectorColumn: "vec",
      observations: 4,
      dimensions: 1,
    });
    const rows = (await connection.runAndReadAll(
      `SELECT vec[1], ${
        buildMahalanobisDistanceSql("vec", model)
      } FROM prepared ORDER BY row_id`,
    )).getRowsJS();
    const standardDeviation = Math.sqrt(model.covariance[0]);
    for (const [value, distance] of rows) {
      assertAlmostEquals(
        Number(distance),
        Math.abs(Number(value) - model.means[0]) / standardDeviation,
        1e-12,
      );
    }
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("covariance rejects n <= d and singular feature data", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE prepared AS SELECT i AS row_id,
      [i::DOUBLE, (2 * i)::DOUBLE]::DOUBLE[2] AS vec FROM range(3) t(i)`);
    const insufficient = await assertRejects(
      () =>
        computeCovariance(connection, {
          relation: "prepared",
          rowIdColumn: "row_id",
          vectorColumn: "vec",
          observations: 2,
          dimensions: 2,
        }),
      Error,
    );
    assertEquals(insufficient.message.includes("n > d"), true);
    const singular = await assertRejects(
      () =>
        computeCovariance(connection, {
          relation: "prepared",
          rowIdColumn: "row_id",
          vectorColumn: "vec",
          observations: 3,
          dimensions: 2,
        }),
      Error,
    );
    assertEquals(singular.message.includes("linearly dependent"), true);
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
