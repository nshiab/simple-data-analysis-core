import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
  assertStrictEquals,
  assertThrows,
} from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

type ReferenceFixture = {
  numpyVersion: string;
  data: number[][];
  distances: number[];
  squaredDistanceSum: number;
};

const fixture = JSON.parse(
  await Deno.readTextFile(
    new URL("../../fixtures/covariance/numpy-2.3.4.json", import.meta.url),
  ),
) as ReferenceFixture;

function assertClose(
  actual: ArrayLike<number>,
  expected: ArrayLike<number>,
  tolerance = 1e-11,
): void {
  assertEquals(actual.length, expected.length);
  for (let index = 0; index < actual.length; index++) {
    assertAlmostEquals(actual[index], expected[index], tolerance);
  }
}

async function scratchRelations(sdb: SimpleDB): Promise<string[]> {
  return (await sdb.connection!.runAndReadAll(
    `SELECT table_name FROM duckdb_tables()
     WHERE table_name LIKE '__sda_features_%'
        OR table_name LIKE '__sda_mahalanobis_%'
     ORDER BY table_name`,
  )).getRowsJS().map((row) => String(row[0]));
}

Deno.test("mahalanobis matches the pinned NumPy 2.3.4 public-method fixture", async () => {
  assertEquals(fixture.numpyVersion, "2.3.4");
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      ${
      fixture.data.map((row, index) =>
        `(${index}, ${row[0]}, ${row[1]}, ${row[2]}, 'row-${index}')`
      ).join(",\n")
    }
    ) rows(id, observation, feature, value, label)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const typesBefore = await table.getTypes();

    await table.mahalanobis(
      ["observation", "feature", "value"],
      fixture.data[0].map((_, i) =>
        fixture.data.reduce((sum, row) => sum + row[i], 0) / fixture.data.length
      ),
      "distance",
    ).run();

    const data = await table.getData();
    assertClose(data.map((row) => Number(row.distance)), fixture.distances);
    assertEquals(data.map(({ distance: _distance, ...row }) => row), before);
    assertEquals(await table.getTypes(), {
      ...typesBefore,
      distance: "DOUBLE",
    });
    const squaredSum = data.reduce(
      (sum, row) => sum + Number(row.distance) ** 2,
      0,
    );
    assertAlmostEquals(squaredSum, fixture.squaredDistanceSum, 1e-10);
    assertAlmostEquals(squaredSum, (data.length - 1) * 3, 1e-10);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis accepts every numeric scalar type and computes one-dimensional absolute sample z-scores", async () => {
  const scalarTypes = [
    "TINYINT",
    "SMALLINT",
    "INTEGER",
    "BIGINT",
    "HUGEINT",
    "UTINYINT",
    "USMALLINT",
    "UINTEGER",
    "UBIGINT",
    "UHUGEINT",
    "BIGNUM",
    "FLOAT",
    "REAL",
    "DOUBLE",
    "DECIMAL(38,10)",
  ];
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    for (const type of scalarTypes) {
      await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
        SELECT i::INTEGER AS id, i::${type} AS feature
        FROM range(3) rows(i)`);
      const typeBefore = (await table.getTypes()).feature;
      await table.mahalanobis(["feature"], [1], "distance").run();
      assertClose(
        (await table.getData()).map((row) => Number(row.distance)),
        [1, 0, 1],
        1e-12,
      );
      assertEquals((await table.getTypes()).feature, typeBefore);
      assertEquals((await table.getTypes()).distance, "DOUBLE");
      assertEquals(await scratchRelations(sdb), []);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis accepts mixed scalar types and numeric ARRAY and LIST vectors", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    const representations = [
      {
        columns: ["x", "y"] as string | string[],
        select: "x::SMALLINT AS x, (y / 10.0)::DECIMAL(18,6) AS y",
      },
      {
        columns: "features" as string | string[],
        select: "[x::INTEGER, y::INTEGER]::INTEGER[2] AS features",
      },
      {
        columns: "features" as string | string[],
        select:
          "[x::DECIMAL(18,3), (y / 10.0)::DECIMAL(18,3)]::DECIMAL(18,3)[] AS features",
      },
    ];
    let reference: number[] | undefined;
    for (const { columns, select } of representations) {
      await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
        SELECT id, ${select}, label FROM (VALUES
          (30, 0, 0, 'duplicate'),
          (10, 1, 20, 'middle'),
          (20, 2, 10, 'duplicate'),
          (40, 4, 50, 'high'),
          (50, 0, 0, 'duplicate')
        ) rows(id, x, y, label)`);
      const before = await table.getData();
      const typesBefore = await table.getTypes();
      await table.mahalanobis(
        columns,
        typeof columns === "string"
          ? [0, 0]
          : (columns.length ? columns.map(() => 0) : [0]),
        "distance",
      ).run();
      const data = await table.getData();
      const actual = data.map((row) => Number(row.distance));
      if (reference === undefined) reference = actual;
      else assertClose(actual, reference, 1e-11);
      assertEquals(data.map(({ distance: _distance, ...row }) => row), before);
      assertEquals(await table.getTypes(), {
        ...typesBefore,
        distance: "DOUBLE",
      });
      assertEquals(await scratchRelations(sdb), []);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis is invariant to translation and independent feature units", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT *,
      x + 1000000000000.0 AS translated_x,
      y - 1000000000000.0 AS translated_y,
      x * 1e-120 AS scaled_x,
      y * -1e120 AS scaled_y
      FROM (VALUES
        (0.0, 0.0), (1.0, 2.0), (2.0, 1.0), (4.0, 5.0), (5.0, 3.0)
      ) rows(x, y)`);
    const table = sdb.newTable("source");
    await table
      .mahalanobis(["x", "y"], [1, 2], "base")
      .mahalanobis(
        ["translated_x", "translated_y"],
        [1e12 + 1, -1e12 + 2],
        "translated",
      )
      .mahalanobis(["scaled_x", "scaled_y"], [1e-120, -2e120], "scaled")
      .run();
    const data = await table.getData();
    const base = data.map((row) => Number(row.base));
    assertClose(data.map((row) => Number(row.translated)), base, 1e-10);
    assertClose(data.map((row) => Number(row.scaled)), base, 1e-10);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis rejects invalid scalar and vector rows with actionable diagnostics", async () => {
  const invalidCases = [
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        (1.0, 2.0), (NULL, 3.0), (4.0, 'Infinity'::DOUBLE), (5.0, 6.0)
      ) rows(x, y)`,
      columns: ["x", "y"] as string | string[],
      messages: ["2 invalid rows", '"x" (1 row)', '"y" (1 row)'],
    },
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        ([1.0,2.0]::DOUBLE[]), (NULL::DOUBLE[]),
        ([3.0,NULL]::DOUBLE[]), ([4.0,'NaN'::DOUBLE]::DOUBLE[])
      ) rows(features)`,
      columns: "features" as string | string[],
      messages: ['Column "features" has 3 invalid rows'],
    },
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        ([]::INTEGER[]), ([1]::INTEGER[])
      ) rows(features)`,
      columns: "features" as string | string[],
      messages: ["empty vector"],
    },
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        ([1]::INTEGER[]), ([2,3]::INTEGER[]), ([4]::INTEGER[])
      ) rows(features)`,
      columns: "features" as string | string[],
      messages: ["equal dimensions"],
    },
    {
      sql: "CREATE TABLE source (features DOUBLE[2])",
      columns: "features" as string | string[],
      messages: ["n=0 and d=2"],
    },
    {
      sql: "CREATE TABLE source (features DOUBLE[])",
      columns: "features" as string | string[],
      messages: ["could not determine a vector dimension"],
    },
  ];
  for (const { sql, columns, messages } of invalidCases) {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(sql);
      const table = sdb.newTable("source");
      const before = await table.getData();
      const error = await assertRejects(() =>
        table.mahalanobis(
          columns,
          typeof columns === "string"
            ? [0, 0]
            : (columns.length ? columns.map(() => 0) : [0]),
          "distance",
        ).run()
      );
      assert(error instanceof Error);
      for (const message of messages) assert(error.message.includes(message));
      assertEquals(await table.getData(), before);
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  }
});

Deno.test("mahalanobis rejects missing, duplicate, and nonnumeric feature specifications", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1.0, 'a'), (2.0, 'b'), (3.0, 'c')
    ) rows(x, label)`);
    const table = sdb.newTable("source");
    for (
      const [columns, message] of [
        [[], "at least one numeric scalar column"],
        [["x", "X"], "duplicate input column"],
        [["missing"], "could not find column"],
        [["label"], "not numeric scalars"],
        ["x", "numeric LIST or ARRAY column"],
      ] as [string | string[], string][]
    ) {
      await assertRejects(
        () =>
          table.mahalanobis(
            columns,
            typeof columns === "string"
              ? [0, 0]
              : (columns.length ? columns.map(() => 0) : [0]),
            "distance",
          ).run(),
        Error,
        message,
      );
      assertEquals(await scratchRelations(sdb), []);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis rejects insufficient, singular, and unrepresentable covariance", async () => {
  const cases = [
    {
      sql: `CREATE TABLE source AS SELECT * FROM (VALUES
        (0.0,0.0), (1.0,2.0)
      ) rows(x,y)`,
      columns: ["x", "y"],
      message: "n=2 and d=2",
    },
    {
      sql: `CREATE TABLE source AS SELECT i::DOUBLE AS x,
        (2*i)::DOUBLE AS y FROM range(5) rows(i)`,
      columns: ["x", "y"],
      message: "linearly dependent",
    },
    {
      sql: `CREATE TABLE source AS SELECT i::DOUBLE AS x,
        7.0 AS constant FROM range(4) rows(i)`,
      columns: ["x", "constant"],
      message: "constant values",
    },
    {
      sql: `CREATE TABLE source AS SELECT x FROM (VALUES
        (-1.7976931348623157e308), (0.0), (1.7976931348623157e308)
      ) rows(x)`,
      columns: ["x"],
      message: "numerically unstable",
    },
    {
      sql: `CREATE TABLE source AS SELECT x FROM (VALUES
        (9007199254740992::BIGINT), (9007199254740993::BIGINT)
      ) rows(x)`,
      columns: ["x"],
      message: "unrepresentable range",
    },
  ];
  for (const { sql, columns, message } of cases) {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(sql);
      const table = sdb.newTable("source");
      const typesBefore = await table.getTypes();
      await assertRejects(
        () =>
          table.mahalanobis(
            columns,
            typeof columns === "string"
              ? [0, 0]
              : (columns.length ? columns.map(() => 0) : [0]),
            "distance",
          ).run(),
        Error,
        message,
      );
      assertEquals(await table.getTypes(), typesBefore);
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  }
});

Deno.test("mahalanobis rejects output collisions before invalid input preparation using ASCII folding", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      NULL::DOUBLE[1] AS features, 42 AS "Distance", 'keep' AS "É"`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    await assertRejects(
      () => table.mahalanobis("features", [0], "DISTANCE").run(),
      Error,
      "column already exists",
    );
    assertEquals(await table.getData(), before);
    assertEquals(await scratchRelations(sdb), []);

    await sdb.customQuery(
      `CREATE OR REPLACE TABLE source AS SELECT * FROM (VALUES
      (0.0,0.0,'a'), (1.0,2.0,'b'), (2.0,1.0,'c'), (4.0,5.0,'d')
    ) rows(x,y,"É")`,
    );
    await table.mahalanobis(["x", "y"], [0, 0], "é").run();
    assertEquals(Object.keys(await table.getTypes()), ["x", "y", "É", "é"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis composes with queued operations and snapshots columns, reference, and options", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1,0.0,0.0,true), (2,1.0,2.0,true), (3,2.0,1.0,true),
      (4,4.0,5.0,true), (5,100.0,100.0,false)
    ) rows(id,x,y,keep)`);
    const table = sdb.newTable("source");
    const columns = ["x", "y"];
    const reference = [0, 0];
    const options = { similarityScoreColumn: "similarity" };
    table.filter("keep")
      .mahalanobis(columns, reference, "distance", options)
      .selectColumns(["id", "distance", "similarity"]);
    columns[0] = "missing";
    columns.push("alsoMissing");
    reference[0] = Infinity;
    reference.push(1);
    options.similarityScoreColumn = "changed";

    const data = await table.getData();
    assertEquals(data.map((row) => row.id), [1, 2, 3, 4]);
    assert(data.every((row) => Number.isFinite(row.distance)));
    assertEquals(data[0].distance, 0);
    assertEquals(data[0].similarity, 1);
    assertEquals(Math.min(...data.map((row) => Number(row.similarity))), 0);
    assertEquals(Object.keys(await table.getTypes()), [
      "id",
      "distance",
      "similarity",
    ]);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis preserves a file-backed table, its row order, types, and indexes", async () => {
  const directory = await Deno.makeTempDir({ prefix: "sda-mahalanobis-" });
  const sdb = new SimpleDB({ file: `${directory}/analysis.duckdb` });
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (30, 0::SMALLINT, 0.00::DECIMAL(18,2), 'first'),
      (10, 1::SMALLINT, 2.00::DECIMAL(18,2), 'second'),
      (20, 2::SMALLINT, 1.00::DECIMAL(18,2), 'third'),
      (40, 4::SMALLINT, 5.00::DECIMAL(18,2), 'fourth')
    ) rows(id,x,y,label);
    CREATE INDEX source_id ON source(id)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const typesBefore = await table.getTypes();
    await table.mahalanobis(["x", "y"], [0, 0], "distance", {
      similarityScoreColumn: "similarity",
    }).run();
    const after = await table.getData();
    assertEquals(
      after.map(({ distance: _distance, similarity: _similarity, ...row }) =>
        row
      ),
      before,
    );
    assertEquals(after.map((row) => row.id), [30, 10, 20, 40]);
    assertEquals(await table.getTypes(), {
      ...typesBefore,
      distance: "DOUBLE",
      similarity: "DOUBLE",
    });
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'source'",
      )).getRowsJS(),
      [["source_id"]],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("mahalanobis rolls back publication and cleans scratch state after commit failure", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1,0.0,0.0), (2,1.0,2.0), (3,2.0,1.0), (4,4.0,5.0)
    ) rows(id,x,y);
    CREATE UNIQUE INDEX source_id ON source(id)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const typesBefore = await table.getTypes();
    const connection = sdb.connection!;
    const original = connection.run;
    const failure = new Error("Simulated publication commit failure");
    connection.run = function (...args) {
      if (args[0] === "COMMIT") return Promise.reject(failure);
      return original.apply(this, args);
    };
    try {
      const error = await assertRejects(() =>
        table.mahalanobis(["x", "y"], [0, 0], "distance", {
          similarityScoreColumn: "similarity",
        }).run()
      );
      assertStrictEquals(error, failure);
    } finally {
      connection.run = original;
    }
    assertEquals(await table.getData(), before);
    assertEquals(await table.getTypes(), typesBefore);
    assertEquals(
      (await connection.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'source'",
      )).getRowsJS(),
      [["source_id"]],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis preserves quoted vectors, exact typed payloads, and HNSW indexes", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT id,
      [x,y]::FLOAT[2] AS "Feature "" values",
      (9007199254740992::BIGINT + id) AS row_id,
      (123456789.123456789::DECIMAL(18,9) + id) AS distance,
      '{"value":[1,2]}'::JSON AS weight,
      DATE '2020-01-01' + id AS origin,
      {'feature': id, 'value': 'retained'} AS observation
      FROM (VALUES (3,1,2), (1,2,1), (4,4,5), (2,5,4)) rows(id,x,y)`);
    const table = sdb.newTable("source");
    await table.createVssIndex('Feature " values').run();
    const typesBefore = await table.getTypes();
    const indexesBefore = structuredClone(table.indexes);
    const sourceQuery = `SELECT id, "Feature "" values", row_id::VARCHAR,
      distance::VARCHAR, weight::VARCHAR, origin::VARCHAR, observation
      FROM source`;
    const before = (await sdb.connection!.runAndReadAll(sourceQuery))
      .getRowsJS();
    await table.mahalanobis('FEATURE " VALUES', [3, 3], 'Computed " distance')
      .run();
    assertEquals(
      (await sdb.connection!.runAndReadAll(sourceQuery)).getRowsJS(),
      before,
    );
    assertEquals(await table.getTypes(), {
      ...typesBefore,
      'Computed " distance': "DOUBLE",
    });
    const distances = (await sdb.connection!.runAndReadAll(
      'SELECT "Computed "" distance" FROM source',
    )).getRowsJS().map((row) => Number(row[0]));
    assert(distances.every(Number.isFinite));
    assertAlmostEquals(
      distances.reduce((sum, distance) => sum + distance ** 2, 0),
      6,
      1e-11,
    );
    assertEquals(table.indexes, indexesBefore);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'source'",
      )).getRowsJS(),
      [["vss_cosine_index_source"]],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis numerical failure aborts later queued operations and permits retry", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS
      SELECT i AS id, [i, 2*i]::DOUBLE[2] AS features
      FROM range(4) rows(i)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const typesBefore = await table.getTypes();
    await assertRejects(
      () =>
        table.mahalanobis("features", [0, 0], "distance")
          .selectColumns(["distance"]).run(),
      Error,
      "linearly dependent",
    );
    assertEquals(await table.getData(), before);
    assertEquals(await table.getTypes(), typesBefore);
    assertEquals(await scratchRelations(sdb), []);
    await table.mahalanobis(["id"], [1.5], "distance").run();
    assertClose(
      (await table.getData()).map((row) => Number(row.distance)),
      [1.5, 0.5, 0.5, 1.5].map((value) => value / Math.sqrt(5 / 3)),
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("multivariate chaining preserves physical column order for integer-like identifiers", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1,2,'first'), (2,1,'second'), (4,5,'third'), (5,4,'fourth')
    ) rows("2","1",payload)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    assertEquals(await table.getColumns(), ["2", "1", "payload"]);
    await table.rowToVector(["2", "1"], "0")
      .normalizeVector("0", "0")
      .mahalanobis("0", [0.5, 0.5], "3").run();
    assertEquals(await table.getColumns(), ["2", "1", "payload", "0", "3"]);
    const data = await table.getData();
    assertEquals(
      data.map(({ "0": _vector, "3": _distance, ...row }) => row),
      before,
    );
    assertAlmostEquals(
      data.reduce((sum, row) => sum + Number(row["3"]) ** 2, 0),
      6,
      1e-11,
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis uses the supplied scalar or vector reference and dataset-relative similarity", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT i AS id,
      i::DOUBLE AS x, [i::DOUBLE]::DOUBLE[1] AS vector FROM range(3) rows(i)`);
    const table = sdb.newTable("source");
    await table.mahalanobis(["x"], [0], "distance", {
      similarityScoreColumn: "score",
    })
      .mahalanobis("vector", [4], "outside", {
        similarityScoreColumn: "outside_score",
      })
      .run();
    const data = await table.getData();
    assertEquals(data.map((row) => row.distance), [0, 1, 2]);
    assertEquals(data.map((row) => row.score), [1, 0.5, 0]);
    assertEquals(data.map((row) => row.outside), [4, 3, 2]);
    assertEquals(data.map((row) => row.outside_score), [0, 0.25, 0.5]);
    assertEquals((await table.getTypes()).score, "DOUBLE");
    assertEquals((await table.getTypes()).outside_score, "DOUBLE");
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis follows reference dimension order with correlated sample covariance", async () => {
  const sdb = new SimpleDB();
  try {
    // Sample covariance = [[4/3, 4/3], [4/3, 8/3]].
    await sdb.customQuery(
      `CREATE TABLE source AS SELECT x, y, [y,x]::DOUBLE[2] AS reversed
      FROM (VALUES (0,0), (2,0), (2,2), (0,-2)) rows(x,y)`,
    );
    const table = sdb.newTable("source");
    await table.mahalanobis(["x", "y"], [3, -1], "distance")
      .mahalanobis("reversed", [-1, 3], "reversed_distance").run();
    for (const row of await table.getData()) {
      // Evaluate using the direct 2x2 inverse to keep the oracle independent.
      const dx = Number(row.x) - 3;
      const dy = Number(row.y) + 1;
      const determinant = (4 / 3) * (8 / 3) - (4 / 3) ** 2;
      const expected = Math.sqrt(
        ((8 / 3) * dx * dx - (8 / 3) * dx * dy + (4 / 3) * dy * dy) /
          determinant,
      );
      assertAlmostEquals(Number(row.distance), expected, 1e-12);
      assertAlmostEquals(Number(row.reversed_distance), expected, 1e-12);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis retains finite extreme distances and tiny reference offsets", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE source AS SELECT i::DOUBLE AS x FROM range(3) rows(i)",
    );
    const table = sdb.newTable("source");
    await table.mahalanobis(["x"], [1e308], "huge", {
      similarityScoreColumn: "score",
    })
      .mahalanobis(["x"], [1e-200], "tiny").run();
    const data = await table.getData();
    assertEquals(data.map((row) => row.huge), [1e308, 1e308, 1e308]);
    assertEquals(data.map((row) => row.score), [0, 0, 0]);
    assertEquals(data[0].tiny, 1e-200);
    assertEquals(data[1].tiny, 1);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis validates reference values and dimensions without changing the source", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      `CREATE TABLE source AS SELECT i AS x, [i,i*i]::DOUBLE[2] AS vector FROM range(4) rows(i)`,
    );
    const table = sdb.newTable("source");
    const before = await table.getData();
    for (
      const reference of [
        [],
        [NaN],
        [Infinity],
        [-Infinity],
        ["1"],
        [null],
        new Array(1),
        undefined,
      ]
    ) {
      assertThrows(
        () => table.mahalanobis(["x"], reference as number[], "distance"),
        Error,
        "nonempty array of finite numbers",
      );
    }
    for (const columns of [["x"], "vector"] as (string | string[])[]) {
      await assertRejects(
        () =>
          table.mahalanobis(columns, [1, 2, 3], "distance", {
            similarityScoreColumn: "score",
          }).run(),
        Error,
        "received 3",
      );
    }
    assertEquals(await table.getData(), before);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis validates both output names before preparing invalid features", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE source AS SELECT NULL::DOUBLE[1] AS features, 42 AS Score",
    );
    const table = sdb.newTable("source");
    const before = await table.getData();
    const cases = [
      {
        distance: "distance",
        score: "SCORE",
        message: "column already exists",
      },
      { distance: "Distance", score: "DISTANCE", message: "different names" },
      { distance: "", score: "score2", message: "nonempty strings" },
      { distance: "distance", score: "", message: "nonempty strings" },
      { distance: "distance", score: "bad\0name", message: "null characters" },
    ];
    for (const { distance, score, message } of cases) {
      await assertRejects(
        () =>
          table.mahalanobis("features", [0], distance, {
            similarityScoreColumn: score,
          }).run(),
        Error,
        message,
      );
      assertEquals(await table.getData(), before);
      assertEquals(await scratchRelations(sdb), []);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis leaves both outputs unpublished when a reference produces unrepresentable distances", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      `CREATE TABLE source AS SELECT i AS id, i / 2.0 AS x FROM range(3) rows(i);
      CREATE UNIQUE INDEX source_id ON source(id)`,
    );
    const table = sdb.newTable("source");
    const before = await table.getData();
    const types = await table.getTypes();
    await assertRejects(
      () =>
        table.mahalanobis(["x"], [1e308], "distance", {
          similarityScoreColumn: "score",
        }).run(),
      Error,
      "non-finite",
    );
    assertEquals(await table.getData(), before);
    assertEquals(await table.getTypes(), types);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'source'",
      )).getRowsJS(),
      [["source_id"]],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});
