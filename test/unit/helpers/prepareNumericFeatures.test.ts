import { assert, assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import prepareNumericFeatures from "../../../src/helpers/prepareNumericFeatures.ts";
import quoteIdentifier from "../../../src/helpers/quoteIdentifier.ts";

async function scratchRelations(sdb: SimpleDB): Promise<string[]> {
  return (await sdb.connection!.runAndReadAll(
    "SELECT table_name FROM duckdb_tables() WHERE table_name LIKE '__sda_features_%'",
  )).getRowsJS().map((row) => String(row[0]));
}

Deno.test("prepareNumericFeatures prepares mixed scalars and stable duplicate row identities", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TEMP TABLE source AS
      SELECT * FROM (VALUES
        ('duplicate', 1::INTEGER, 2.5::FLOAT),
        ('duplicate', 1::INTEGER, 2.5::FLOAT),
        ('third', 3::INTEGER, 4.5::FLOAT)
      ) AS rows(label, count, score)`);
    const table = sdb.newTable("source");
    const prepared = await prepareNumericFeatures(
      table,
      { kind: "scalars", columns: ["SCORE", "count"] },
      { method: "analysis()" },
    );
    try {
      assertEquals(prepared.dimensions, 2);
      assertEquals(prepared.rowCount, 3);
      assertEquals(prepared.sourceColumns, ["label", "count", "score"]);
      assertEquals(prepared.sourceTemporary, true);
      const q = quoteIdentifier;
      const rows = (await sdb.connection!.runAndReadAll(
        `SELECT ${q(prepared.rowIdColumn)}, label,
          ${q(prepared.vectorColumn)}[1], ${q(prepared.vectorColumn)}[2]
         FROM ${q(prepared.relation)} ORDER BY ${q(prepared.rowIdColumn)}`,
      )).getRowsJS().map((row) => [Number(row[0]), ...row.slice(1)]);
      assertEquals(rows, [
        [0, "duplicate", 2.5, 1],
        [1, "duplicate", 2.5, 1],
        [2, "third", 4.5, 3],
      ]);
      const types = (await sdb.connection!.runAndReadAll(
        `DESCRIBE ${q(prepared.relation)}`,
      )).getRowsJS();
      assert(
        types.some((row) =>
          row[0] === prepared.vectorColumn && row[1] === "DOUBLE[2]"
        ),
      );
    } finally {
      await prepared.cleanup();
      await prepared.cleanup();
    }
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("prepareNumericFeatures supports fixed ARRAY and equal-length LIST vectors", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    for (
      const [expression, expectedDimensions] of [
        ["array_value(i::INTEGER, (i + 1)::INTEGER)", 2],
        ["[i::INTEGER, (i + 1)::INTEGER]::INTEGER[]", 2],
      ] as const
    ) {
      await sdb.customQuery(
        `CREATE OR REPLACE TABLE source AS
         SELECT i AS id, ${expression} AS features FROM range(3) rows(i)`,
      );
      const prepared = await prepareNumericFeatures(
        table,
        { kind: "vector", column: "features" },
        { method: "analysis()" },
      );
      try {
        assertEquals(prepared.dimensions, expectedDimensions);
        assertEquals(prepared.rowCount, 3);
        const q = quoteIdentifier;
        assertEquals(
          (await sdb.connection!.runAndReadAll(
            `SELECT ${q(prepared.vectorColumn)}[1], ${
              q(prepared.vectorColumn)
            }[2] FROM ${q(prepared.relation)} ORDER BY id`,
          )).getRowsJS(),
          [[0, 1], [1, 2], [2, 3]],
        );
      } finally {
        await prepared.cleanup();
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("prepareNumericFeatures documents DOUBLE precision through source-preserving conversion", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE source AS SELECT 9007199254740993::BIGINT AS exact",
    );
    const prepared = await prepareNumericFeatures(
      sdb.newTable("source"),
      { kind: "scalars", columns: ["exact"] },
      { method: "analysis()" },
    );
    try {
      const q = quoteIdentifier;
      assertEquals(
        (await sdb.connection!.runAndReadAll(
          `SELECT exact = 9007199254740993::BIGINT,
            ${q(prepared.vectorColumn)}[1] = 9007199254740992::DOUBLE
           FROM ${q(prepared.relation)}`,
        )).getRowsJS(),
        [[true, true]],
      );
    } finally {
      await prepared.cleanup();
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("prepareNumericFeatures reports invalid scalar row counts and affected columns", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS
      SELECT * FROM (VALUES
        (1::DOUBLE, 2::DOUBLE),
        (NULL::DOUBLE, 'Infinity'::DOUBLE),
        ('NaN'::DOUBLE, 3::DOUBLE)
      ) AS rows(a, b)`);
    await assertRejects(
      () =>
        prepareNumericFeatures(
          sdb.newTable("source"),
          { kind: "scalars", columns: ["a", "b"] },
          { method: "mahalanobis()" },
        ),
      Error,
      'Found 2 invalid rows. Affected columns: "a" (2 rows), "b" (1 row)',
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

for (
  const [expression, message] of [
    ["NULL::DOUBLE[]", "2 invalid rows"],
    ["[1,NULL]::DOUBLE[]", "2 invalid rows"],
    ["[1,'NaN'::DOUBLE]::DOUBLE[]", "2 invalid rows"],
    ["[]::DOUBLE[]", "empty vector"],
    [
      "CASE WHEN i=0 THEN [1]::INTEGER[] ELSE [1,2]::INTEGER[] END",
      "equal dimensions",
    ],
  ] as const
) {
  Deno.test(`prepareNumericFeatures rejects invalid vectors: ${expression}`, async () => {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(
        `CREATE TABLE source AS SELECT ${expression} AS vector FROM range(2) rows(i)`,
      );
      await assertRejects(
        () =>
          prepareNumericFeatures(
            sdb.newTable("source"),
            { kind: "vector", column: "vector" },
            { method: "hdbscan()" },
          ),
        Error,
        message,
      );
      assertEquals(await scratchRelations(sdb), []);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("prepareNumericFeatures validates source shape and columns", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE source AS SELECT 1::INTEGER AS number, 'one' AS text, [[1,2],[3,4]] AS nested",
    );
    const table = sdb.newTable("source");
    for (
      const [input, message] of [
        [
          { kind: "scalars", columns: [] },
          "at least one numeric scalar column",
        ],
        [
          { kind: "scalars", columns: ["number", "NUMBER"] },
          "duplicate input column",
        ],
        [{ kind: "scalars", columns: ["text"] }, "not numeric scalars"],
        [{ kind: "scalars", columns: ["missing"] }, "could not find column"],
        [{ kind: "vector", column: "number" }, "numeric LIST or ARRAY"],
        [{ kind: "vector", column: "nested" }, "one-dimensional"],
      ] as [
        | { kind: "scalars"; columns: string[] }
        | { kind: "vector"; column: string },
        string,
      ][]
    ) {
      await assertRejects(
        () =>
          prepareNumericFeatures(
            table,
            input,
            { method: "analysis()" },
          ),
        Error,
        message,
      );
    }
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});

Deno.test("prepareNumericFeatures supports empty fixed ARRAY input and diagnoses empty LIST schema", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE source (id INTEGER, fixed INTEGER[2], listed INTEGER[])",
    );
    const table = sdb.newTable("source");
    const prepared = await prepareNumericFeatures(
      table,
      { kind: "vector", column: "fixed" },
      { method: "analysis()" },
    );
    assertEquals(prepared.rowCount, 0);
    assertEquals(prepared.dimensions, 2);
    await prepared.cleanup();

    await assertRejects(
      () =>
        prepareNumericFeatures(
          table,
          { kind: "vector", column: "listed" },
          { method: "analysis()" },
        ),
      Error,
      "could not determine a vector dimension",
    );
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
  }
});
