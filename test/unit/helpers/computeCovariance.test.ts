import { assertAlmostEquals, assertEquals, assertRejects } from "@std/assert";
import { type DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import computeMahalanobisDistances from "../../../src/helpers/computeMahalanobisDistances.ts";
import type { CovarianceModel } from "../../../src/helpers/computeCovariance.ts";
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

async function distances(
  connection: DuckDBConnection,
  relation: string,
  model: CovarianceModel,
) {
  const result = await computeMahalanobisDistances(connection, {
    relation,
    rowIdColumn: "row_id",
    vectorColumn: "vec",
  }, model);
  try {
    return (await connection.runAndReadAll(
      `SELECT distance FROM "${result.relation}" ORDER BY row_id`,
    )).getRowsJS().flat().map(Number);
  } finally {
    await result.cleanup();
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

    const evaluated = await distances(connection, "prepared", model);
    assertCloseArray(evaluated, fixture.distances, 1e-11);
    const squaredSum = evaluated.reduce(
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

    const baseDistances = await distances(connection, "base", original);
    const translatedDistances = await distances(
      connection,
      "translated",
      translated,
    );
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
    const evaluated = await distances(connection, "prepared", model);
    const standardDeviation = Math.sqrt(model.covariance[0]);
    for (const [i, value] of [1, 2, 6, 7].entries()) {
      assertAlmostEquals(
        evaluated[i],
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

Deno.test("bulk Mahalanobis is invariant under extreme finite changes of units", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE base AS SELECT i AS row_id,
      [x, y]::DOUBLE[2] AS vec FROM (VALUES
      (0, 1, 2), (1, 2, 5), (2, 4, 3), (3, 5, 8), (4, 7, 6)
      ) t(i, x, y)`);
    await connection.run(`CREATE TEMP TABLE scaled AS SELECT row_id,
      [vec[1] * 1e-150, vec[2] * -1e150]::DOUBLE[2] AS vec FROM base`);
    const calculate = (relation: string) =>
      computeCovariance(connection, {
        relation,
        rowIdColumn: "row_id",
        vectorColumn: "vec",
        observations: 5,
        dimensions: 2,
      });
    const ordinary = await calculate("base");
    const extreme = await calculate("scaled");
    assertAlmostEquals(
      extreme.covariance[0] / 1e-300,
      ordinary.covariance[0],
      1e-12,
    );
    assertAlmostEquals(
      extreme.covariance[3] / 1e300,
      ordinary.covariance[3],
      1e-12,
    );
    assertAlmostEquals(
      extreme.reciprocalCondition,
      ordinary.reciprocalCondition,
      1e-14,
    );
    assertCloseArray(
      await distances(connection, "scaled", extreme),
      await distances(connection, "base", ordinary),
      1e-12,
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("native distance evaluation preserves identity in 32 dimensions", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    // Orthogonal +/- basis rows have exact zero means and diagonal covariance.
    // This reference uses algebra rather than the production matrix solver.
    const dimensions = 32;
    const observations = 2 * dimensions;
    await connection.run(`CREATE TEMP TABLE prepared AS SELECT i AS row_id,
      list_transform(range(${dimensions}), feature ->
        CASE WHEN feature = i // 2 THEN CASE WHEN i % 2 = 0 THEN 1 ELSE -1 END ELSE 0 END
      )::DOUBLE[${dimensions}] AS vec FROM range(${observations}) source(i)`);
    const model = await computeCovariance(connection, {
      relation: "prepared",
      rowIdColumn: "row_id",
      vectorColumn: "vec",
      observations,
      dimensions,
    });
    assertCloseArray(model.means, new Float64Array(dimensions));
    const expected = Math.sqrt((observations - 1) / 2);
    const evaluated = await distances(connection, "prepared", model);
    assertEquals(evaluated.length, observations);
    assertCloseArray(
      evaluated,
      new Float64Array(observations).fill(expected),
      1e-12,
    );
    assertAlmostEquals(
      evaluated.reduce((sum, value) => sum + value * value, 0),
      (observations - 1) * dimensions,
      1e-10,
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("sample covariance avoids overflowing a finite result during accumulation", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE prepared AS SELECT i AS row_id,
      [i * 1e154]::DOUBLE[1] AS vec FROM range(3) t(i)`);
    const model = await computeCovariance(connection, {
      relation: "prepared",
      rowIdColumn: "row_id",
      vectorColumn: "vec",
      observations: 3,
      dimensions: 1,
    });
    assertAlmostEquals(model.covariance[0] / 1e308, 1, 1e-14);
    assertCloseArray(
      await distances(connection, "prepared", model),
      [1, 0, 1],
      1e-14,
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("covariance rejects insufficient embedding sample counts before aggregation", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    for (const dimensions of [384, 768, 1536]) {
      for (const observations of [dimensions - 1, dimensions]) {
        await assertRejects(
          () =>
            computeCovariance(connection, {
              relation: "absent",
              rowIdColumn: "row_id",
              vectorColumn: "vec",
              observations,
              dimensions,
            }),
          Error,
          "n > d",
        );
      }
    }
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
