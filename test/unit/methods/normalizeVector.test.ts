import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
} from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

function assertVectorAlmostEquals(
  actual: unknown,
  expected: number[],
  tolerance = 1e-12,
): void {
  assert(Array.isArray(actual));
  assertEquals(actual.length, expected.length);
  actual.forEach((value, index) => {
    assertEquals(typeof value, "number");
    assertAlmostEquals(value, expected[index], tolerance);
  });
}

async function scratchRelations(sdb: SimpleDB): Promise<string[]> {
  return (await sdb.connection!.runAndReadAll(
    `SELECT table_name FROM duckdb_tables()
     WHERE table_name LIKE '__sda_features_%'
        OR table_name LIKE '__sda_normalize_vector_%'
     ORDER BY table_name`,
  )).getRowsJS().map((row) => String(row[0]));
}

Deno.test("normalizeVector scales dimensions across rows and preserves ARRAY/LIST sources", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    for (
      const [expression, expectedType] of [
        ["features::INTEGER[2]", "INTEGER[2]"],
        ["features::INTEGER[]", "INTEGER[]"],
      ] as const
    ) {
      await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
        SELECT id, label, ${expression} AS features FROM (VALUES
          (1, 'duplicate', [10,1000]),
          (2, 'middle', [20,1000]),
          (3, 'duplicate', [30,3000])
        ) rows(id,label,features)`);
      const before = (await sdb.connection!.runAndReadAll(
        "SELECT id, label, features::VARCHAR FROM source ORDER BY id",
      )).getRowsJS();

      await table.normalizeVector("features", "scaled").run();
      const data = await table.getData();
      assertVectorAlmostEquals(data[0].scaled, [0, 0]);
      assertVectorAlmostEquals(data[1].scaled, [0.5, 0]);
      assertVectorAlmostEquals(data[2].scaled, [1, 1]);
      assertEquals((await table.getTypes()).features, expectedType);
      assertEquals((await table.getTypes()).scaled, "DOUBLE[2]");
      assertEquals(
        (await sdb.connection!.runAndReadAll(
          "SELECT id, label, features::VARCHAR FROM source ORDER BY id",
        )).getRowsJS(),
        before,
      );
      assertEquals(await scratchRelations(sdb), []);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector handles negative, one-dimensional, duplicate, and extreme finite values", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1, [-1.7976931348623157e308, -10]::DOUBLE[2]),
      (2, [0, 0]::DOUBLE[2]),
      (3, [1.7976931348623157e308, 10]::DOUBLE[2]),
      (4, [0, 0]::DOUBLE[2])
    ) rows(id,features)`);
    const table = sdb.newTable("source");
    await table.normalizeVector("features", "scaled").run();
    const data = await table.getData();
    assertVectorAlmostEquals(data[0].scaled, [0, 0]);
    assertVectorAlmostEquals(data[1].scaled, [0.5, 0.5]);
    assertVectorAlmostEquals(data[2].scaled, [1, 1]);
    assertVectorAlmostEquals(data[3].scaled, [0.5, 0.5]);

    await sdb.customQuery(`CREATE OR REPLACE TABLE source AS
      SELECT i AS id, [i * 10 - 20]::INTEGER[] AS features
      FROM range(3) rows(i)`);
    await table.normalizeVector("features", "scaled").run();
    assertEquals(
      (await table.getData()).map((row) => row.scaled),
      [[0], [0.5], [1]],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector preserves typed payloads and intentionally replaces the source type", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1::BIGINT, 123456789.123456789::DECIMAL(18,9), '{"a":[1,2]}'::JSON,
        DATE '2020-01-01', {'name':'first','count':1},
        [1.25::DECIMAL(18,2),10.00::DECIMAL(18,2)]::DECIMAL(18,2)[2]),
      (2::BIGINT, 987654321.987654321::DECIMAL(18,9), '{"a":[3]}'::JSON,
        DATE '2020-01-02', {'name':'second','count':2},
        [3.75::DECIMAL(18,2),30.00::DECIMAL(18,2)]::DECIMAL(18,2)[2])
    ) rows(id,precise,payload,created,info,"Feature")`);
    const table = sdb.newTable("source");
    const typesBefore = await table.getTypes();
    const payloadBefore = (await sdb.connection!.runAndReadAll(
      `SELECT id::VARCHAR, precise::VARCHAR, payload::VARCHAR,
        created::VARCHAR, info::VARCHAR FROM source ORDER BY id`,
    )).getRowsJS();

    await table.normalizeVector("feature", "FEATURE").run();
    const typesAfter = await table.getTypes();
    assertEquals(Object.keys(typesAfter), Object.keys(typesBefore));
    assertEquals(typesAfter.Feature, "DOUBLE[2]");
    for (const [name, type] of Object.entries(typesBefore)) {
      if (name !== "Feature") assertEquals(typesAfter[name], type);
    }
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        `SELECT id::VARCHAR, precise::VARCHAR, payload::VARCHAR,
          created::VARCHAR, info::VARCHAR FROM source ORDER BY id`,
      )).getRowsJS(),
      payloadBefore,
    );
    assertEquals((await table.getData()).map((row) => row.Feature), [[0, 0], [
      1,
      1,
    ]]);
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector scales subnormal and asymmetric extreme ranges", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1, [0, -1e-323, -5e-324, -1.7976931348623157e308,
        -8.988465674311579e307, 8.988465674311579e307]::DOUBLE[6]),
      (2, [5e-324, -5e-324, 0, 0, 0, 1.3482698511467367e308]::DOUBLE[6]),
      (3, [1e-323, 0, 1e-323, 8.988465674311579e307,
        1.7976931348623157e308, 1.7976931348623157e308]::DOUBLE[6])
    ) rows(id,features)`);
    const table = sdb.newTable("source");
    await table.normalizeVector("features", "scaled").run();
    const data = await table.getData();
    assertVectorAlmostEquals(data[0].scaled, [0, 0, 0, 0, 0, 0]);
    assertVectorAlmostEquals(data[1].scaled, [
      0.5,
      0.5,
      1 / 3,
      2 / 3,
      1 / 3,
      0.5,
    ]);
    assertVectorAlmostEquals(data[2].scaled, [1, 1, 1, 1, 1, 1]);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector rejects destination collisions before preparing vector values", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      NULL::DOUBLE[1] AS features, 42 AS "Existing"`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    await assertRejects(
      () => table.normalizeVector("features", "EXISTING").run(),
      Error,
      "column already exists",
    );
    assertEquals(await table.getData(), before);
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector follows ASCII identifier matching while keeping Unicode names distinct", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      ([1,10]::INTEGER[2], [2,20]::INTEGER[2], 'first'),
      ([3,30]::INTEGER[2], [4,40]::INTEGER[2], 'second')
    ) rows("Ä","ä","É")`);
    const table = sdb.newTable("source");
    await table.normalizeVector("ä", "é").run();
    assertEquals(Object.keys(await table.getTypes()), ["Ä", "ä", "É", "é"]);
    assertEquals((await table.getData()).map((row) => row.é), [[0, 0], [1, 1]]);
    await assertRejects(
      () => table.normalizeVector("Ä", "ä").run(),
      Error,
      "column already exists",
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector composes with queued operations and snapshots arguments", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1, [10,100]::INTEGER[2], 'keep'),
      (2, [20,300]::INTEGER[2], 'keep'),
      (3, [30,500]::INTEGER[2], 'drop')
    ) rows(id,features,label)`);
    let column = "FEATURES";
    let destination = "scaled";
    table.filter("label = 'keep'")
      .normalizeVector(column, destination)
      .selectColumns(["id", "scaled"]);
    column = "missing";
    destination = "changed";

    assertEquals(await table.getData(), [
      { id: 1, scaled: [0, 0] },
      { id: 2, scaled: [1, 1] },
    ]);
    assertEquals(column, "missing");
    assertEquals(destination, "changed");
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector agrees with scalar min-max preparation", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1, -4::INTEGER, 1000::BIGINT),
      (2, 2::INTEGER, 5000::BIGINT),
      (3, 8::INTEGER, 9000::BIGINT)
    ) rows(id,a,b)`);
    const table = sdb.newTable("source");
    await table
      .rowToVector(["a", "b"], "features", { type: "double" })
      .normalize("a", "normalizedA")
      .normalize("b", "normalizedB")
      .rowToVector(
        ["normalizedA", "normalizedB"],
        "reference",
        { type: "double" },
      )
      .normalizeVector("features", "scaled")
      .run();

    for (const row of await table.getData()) {
      assert(Array.isArray(row.reference));
      assertVectorAlmostEquals(row.scaled, row.reference as number[]);
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector rejects invalid inputs and constant dimensions without changing the source", async () => {
  const cases = [
    ["NULL::DOUBLE[]", "invalid row"],
    ["[1,NULL]::DOUBLE[]", "invalid row"],
    ["[1,'NaN'::DOUBLE]::DOUBLE[]", "invalid row"],
    ["[1,'Infinity'::DOUBLE]::DOUBLE[]", "invalid row"],
    ["[]::DOUBLE[]", "empty vector"],
    [
      "CASE WHEN i=0 THEN [1]::INTEGER[] ELSE [1,2]::INTEGER[] END",
      "equal dimensions",
    ],
  ] as const;
  for (const [expression, message] of cases) {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(
        `CREATE TABLE source AS SELECT i AS id, ${expression} AS features
         FROM range(2) rows(i)`,
      );
      const table = sdb.newTable("source");
      const before = await table.getTypes();
      await assertRejects(
        () => table.normalizeVector("features", "scaled").run(),
        Error,
        message,
      );
      assertEquals(await table.getTypes(), before);
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  }

  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1, [1,7,3]::INTEGER[3]),
      (2, [1,8,3]::INTEGER[3])
    ) rows(id,features)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const error = await assertRejects(
      () => table.normalizeVector("features", "features").run(),
      Error,
      "constant dimensions 1, 3",
    );
    assert(error instanceof Error);
    assert(error.message.includes("range is zero"));
    assertEquals(await table.getData(), before);
    assertEquals((await table.getTypes()).features, "INTEGER[3]");

    await assertRejects(
      () => table.normalizeVector("missing", "scaled").run(),
      Error,
      "could not find column",
    );
    await sdb.customQuery(
      "CREATE OR REPLACE TABLE source AS SELECT 1 AS id, 'text' AS features",
    );
    await assertRejects(
      () => table.normalizeVector("features", "scaled").run(),
      Error,
      "numeric LIST or ARRAY",
    );
    await sdb.customQuery(
      "CREATE OR REPLACE TABLE source (id INTEGER, features DOUBLE[2])",
    );
    await assertRejects(
      () => table.normalizeVector("features", "scaled").run(),
      Error,
      "dataset is empty",
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector reports DOUBLE precision collapse for large exact values", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      ([9007199254740992::BIGINT]::BIGINT[1]),
      ([9007199254740993::BIGINT]::BIGINT[1])
    ) rows(features)`);
    const table = sdb.newTable("source");
    await assertRejects(
      () => table.normalizeVector("features", "scaled").run(),
      Error,
      "precision limit",
    );
    assertEquals((await table.getTypes()).features, "BIGINT[1]");
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector diagnoses vector elements outside DOUBLE representation", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      i AS id,
      [CASE WHEN i = 0 THEN 5::BIGNUM
        ELSE concat('1', repeat('0', 400))::BIGNUM END]::BIGNUM[1] AS features
      FROM range(2) rows(i)`);
    const table = sdb.newTable("source");
    const before = (await sdb.connection!.runAndReadAll(
      "SELECT id, features[1]::VARCHAR FROM source ORDER BY id",
    )).getRowsJS();
    await assertRejects(
      () => table.normalizeVector("features", "scaled").run(),
      Error,
      'Column "features" has 1 invalid row',
    );
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT id, features[1]::VARCHAR FROM source ORDER BY id",
      )).getRowsJS(),
      before,
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("normalizeVector preserves file-backed indexes and selects the temporary source on name collision", async () => {
  const directory = await Deno.makeTempDir();
  const sdb = new SimpleDB({ file: `${directory}/normalize.duckdb` });
  try {
    await sdb.customQuery(`CREATE TABLE source AS
      SELECT 99 AS id, [9,9]::INTEGER[2] AS features;
      CREATE TEMP TABLE SOURCE AS SELECT * FROM (VALUES
        (1, [10,100]::INTEGER[2]),
        (2, [20,200]::INTEGER[2])
      ) rows(id,features);
      CREATE UNIQUE INDEX source_id ON SOURCE(id)`);
    const table = sdb.newTable("SOURCE");
    await table.normalizeVector("features", "scaled").run();
    assertEquals((await table.getData()).map((row) => row.scaled), [[0, 0], [
      1,
      1,
    ]]);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        'SELECT id, features FROM "normalize".main.source',
      )).getRowsJS(),
      [[99, [9, 9]]],
    );
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() WHERE database_name = 'temp'",
      )).getRowsJS(),
      [["source_id"]],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("normalizeVector rolls back failures during publication in new and overwrite modes", async () => {
  for (const destination of ["scaled", "features"]) {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
        (1, [10,100]::INTEGER[2]),
        (2, [20,200]::INTEGER[2])
      ) rows(id,features);
      CREATE UNIQUE INDEX source_id ON source(id)`);
      const table = sdb.newTable("source");
      const before = await table.getData();
      const types = await table.getTypes();
      const original = table.runQuery;
      table.runQuery = async (...args) => {
        const result = await original(...args);
        if (args[3]?.method === "normalizeVector()") {
          throw new Error("Simulated publication failure");
        }
        return result;
      };
      await assertRejects(
        () => table.normalizeVector("features", destination).run(),
        Error,
        "Simulated publication failure",
      );
      table.runQuery = original;
      assertEquals(await table.getData(), before);
      assertEquals(await table.getTypes(), types);
      assertEquals(
        (await sdb.connection!.runAndReadAll(
          "SELECT index_name FROM duckdb_indexes()",
        )).getRowsJS(),
        [["source_id"]],
      );
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  }
});

Deno.test("normalizeVector rolls back an overwrite when an HNSW index cannot support DOUBLE vectors", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source").loadArray([
      { id: 1, features: [1, 2] },
      { id: 2, features: [2, 4] },
      { id: 3, features: [3, 8] },
    ], { columnTypes: { features: "FLOAT[2]" } });
    await table.createVssIndex("features").run();
    const before = await table.getData();
    const indexDefinitions = structuredClone(table.indexes);

    await assertRejects(
      () => table.normalizeVector("features", "features").run(),
      Error,
      "could not restore an existing DuckDB index",
    );
    assertEquals(await table.getData(), before);
    assertEquals((await table.getTypes()).features, "FLOAT[2]");
    assertEquals(table.indexes, indexDefinitions);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes()",
      )).getRowsJS(),
      [["vss_cosine_index_source"]],
    );
    await table.normalizeVector("features", "scaled").run();
    assertEquals((await table.getTypes()).features, "FLOAT[2]");
    assertEquals((await table.getTypes()).scaled, "DOUBLE[2]");
    assertEquals(
      (await table.getData()).map(({ scaled: _scaled, ...row }) => row),
      before,
    );
    assertEquals(table.indexes, indexDefinitions);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes()",
      )).getRowsJS(),
      [["vss_cosine_index_source"]],
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});
