import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
  assertStrictEquals,
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
      await table.mahalanobis(["feature"], "distance").run();
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
      await table.mahalanobis(columns, "distance").run();
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
      .mahalanobis(["x", "y"], "base")
      .mahalanobis(["translated_x", "translated_y"], "translated")
      .mahalanobis(["scaled_x", "scaled_y"], "scaled")
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
  ];
  for (const { sql, columns, messages } of invalidCases) {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(sql);
      const table = sdb.newTable("source");
      const before = await table.getData();
      const error = await assertRejects(() =>
        table.mahalanobis(columns, "distance").run()
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
        () => table.mahalanobis(columns, "distance").run(),
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
        () => table.mahalanobis(columns, "distance").run(),
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
      () => table.mahalanobis("features", "DISTANCE").run(),
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
    await table.mahalanobis(["x", "y"], "é").run();
    assertEquals(Object.keys(await table.getTypes()), ["x", "y", "É", "é"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("mahalanobis composes with queued operations and snapshots column arrays", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1,0.0,0.0,true), (2,1.0,2.0,true), (3,2.0,1.0,true),
      (4,4.0,5.0,true), (5,100.0,100.0,false)
    ) rows(id,x,y,keep)`);
    const table = sdb.newTable("source");
    const columns = ["x", "y"];
    table.filter("keep")
      .mahalanobis(columns, "distance")
      .selectColumns(["id", "distance"]);
    columns[0] = "missing";
    columns.push("alsoMissing");

    const data = await table.getData();
    assertEquals(data.map((row) => row.id), [1, 2, 3, 4]);
    assert(data.every((row) => Number.isFinite(row.distance)));
    assertEquals(Object.keys(await table.getTypes()), ["id", "distance"]);
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
    await table.mahalanobis(["x", "y"], "distance").run();
    const after = await table.getData();
    assertEquals(after.map(({ distance: _distance, ...row }) => row), before);
    assertEquals(after.map((row) => row.id), [30, 10, 20, 40]);
    assertEquals(await table.getTypes(), {
      ...typesBefore,
      distance: "DOUBLE",
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
        table.mahalanobis(["x", "y"], "distance").run()
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
