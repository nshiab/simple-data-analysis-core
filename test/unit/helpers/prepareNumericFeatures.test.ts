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

Deno.test("prepareNumericFeatures preserves quoted Unicode source columns in a file-backed database", async () => {
  const directory = await Deno.makeTempDir();
  const sdb = new SimpleDB({ file: `${directory}/features.duckdb` });
  try {
    await sdb.customQuery(`CREATE TABLE "Ä" AS SELECT
      0.1234567890123456789::DECIMAL(38,19) AS "ä",
      7::INTEGER AS "Ä", 'keep' AS "quoted\"\"column"`);
    // The similarly named temporary table must not change sourceTemporary.
    await sdb.customQuery('CREATE TEMP TABLE "ä" AS SELECT 99 AS unrelated');
    const table = sdb.newTable("Ä");
    const before = await table.getTypes();
    const prepared = await prepareNumericFeatures(table, {
      kind: "scalars",
      columns: ["ä", "Ä"],
    }, { method: "analysis()" });
    try {
      assertEquals(prepared.sourceTemporary, false);
      assertEquals(prepared.sourceColumns, ["ä", "Ä", 'quoted"column']);
      const q = quoteIdentifier;
      assertEquals(
        (await sdb.connection!.runAndReadAll(
          `SELECT "ä"::VARCHAR, "Ä", "quoted""column", ${
            q(prepared.vectorColumn)
          }[1], ${q(prepared.vectorColumn)}[2]
         FROM ${q(prepared.relation)}`,
        )).getRowsJS(),
        [["0.1234567890123456789", 7, "keep", 0.12345678901234568, 7]],
      );
      assertEquals(await table.getTypes(), before);
    } finally {
      await prepared.cleanup();
    }
    assertEquals(await scratchRelations(sdb), []);
  } finally {
    await sdb.close();
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("prepareNumericFeatures diagnoses out-of-range BIGNUM scalars and vector elements", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      CASE WHEN i=0 THEN 5::BIGNUM ELSE concat('1', repeat('0',400))::BIGNUM END AS huge
      FROM range(3) rows(i)`);
    await sdb.customQuery("ALTER TABLE source ADD COLUMN listed BIGNUM[]");
    await sdb.customQuery("ALTER TABLE source ADD COLUMN fixed BIGNUM[1]");
    await sdb.customQuery(
      "UPDATE source SET listed=[huge], fixed=[huge]::BIGNUM[1]",
    );
    const table = sdb.newTable("source");
    const before = await table.getTypes();
    for (
      const input of [
        { kind: "scalars", columns: ["huge"] },
        { kind: "vector", column: "listed" },
        { kind: "vector", column: "fixed" },
      ] as const
    ) {
      const error = await assertRejects(() =>
        prepareNumericFeatures(
          table,
          input.kind === "scalars"
            ? { kind: "scalars", columns: [...input.columns] }
            : input,
          { method: "analysis()" },
        )
      );
      assert(error instanceof Error);
      assert(error.message.includes("2 invalid rows"));
      assert(
        error.message.includes(
          input.kind === "scalars" ? '"huge"' : quoteIdentifier(input.column),
        ),
      );
      assertEquals(await scratchRelations(sdb), []);
    }
    assertEquals(await table.getTypes(), before);
  } finally {
    await sdb.close();
  }
});

Deno.test("prepareNumericFeatures converts representable BIGNUM scalars, ARRAYs, and LISTs", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      9007199254740993::BIGNUM AS huge,
      [9007199254740993::BIGNUM] AS listed,
      [9007199254740993::BIGNUM]::BIGNUM[1] AS fixed`);
    const table = sdb.newTable("source");
    for (const column of ["huge", "listed", "fixed"]) {
      const prepared = await prepareNumericFeatures(
        table,
        column === "huge"
          ? { kind: "scalars", columns: [column] }
          : { kind: "vector", column },
        { method: "analysis()" },
      );
      try {
        const q = quoteIdentifier;
        assertEquals(
          (await sdb.connection!.runAndReadAll(
            `SELECT huge::VARCHAR, ${q(prepared.vectorColumn)}[1] FROM ${
              q(prepared.relation)
            }`,
          )).getRowsJS(),
          [["9007199254740993", 9007199254740992]],
        );
      } finally {
        await prepared.cleanup();
      }
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("prepareNumericFeatures applies null and finite validation independently", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      NULL::DOUBLE AS missing, 'Infinity'::DOUBLE AS infinite,
      [NULL::DOUBLE]::DOUBLE[1] AS missing_element,
      NULL::DOUBLE[1] AS missing_vector,
      ['-Infinity'::DOUBLE] AS infinite_vector`);
    const table = sdb.newTable("source");
    for (
      const column of [
        "missing",
        "infinite",
        "missing_element",
        "missing_vector",
        "infinite_vector",
      ]
    ) {
      const input = column === "missing" || column === "infinite"
        ? { kind: "scalars" as const, columns: [column] }
        : { kind: "vector" as const, column };
      const allowNull = column.startsWith("missing");
      const prepared = await prepareNumericFeatures(table, input, {
        method: "analysis()",
        rejectNulls: !allowNull,
        rejectNonFinite: allowNull,
      });
      await prepared.cleanup();
      await assertRejects(
        () =>
          prepareNumericFeatures(table, input, {
            method: "analysis()",
            rejectNulls: allowNull,
            rejectNonFinite: !allowNull,
          }),
        Error,
        "1 invalid row",
      );
      assertEquals(await scratchRelations(sdb), []);
    }
  } finally {
    await sdb.close();
  }
});
