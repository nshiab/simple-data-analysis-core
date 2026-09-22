import { DuckDBInstance } from "@duckdb/node-api";
import { assertAlmostEquals, assertEquals, assertRejects } from "@std/assert";
import stabilizeCosineVectors from "../../../src/helpers/stabilizeCosineVectors.ts";
import vectorDistanceExpression from "../../../src/helpers/vectorDistanceExpression.ts";

Deno.test("cosine preparation preserves angles across extreme and mixed magnitudes", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    await connection.run(`CREATE TEMP TABLE vectors AS SELECT * FROM (VALUES
      (0,[1,0]::DOUBLE[2],'axis'),
      (1,[1e308,1e308]::DOUBLE[2],'large'),
      (2,[1e-308,1e-308]::DOUBLE[2],'tiny'),
      (3,[-1e308,0]::DOUBLE[2],'opposite'),
      (4,[0,1e-308]::DOUBLE[2],'orthogonal'),
      (5,[1e-100,0]::DOUBLE[2],'aligned')) t(vertex,vec,payload)`);
    await stabilizeCosineVectors(connection, '"vectors"');
    const distances = (await connection.runAndReadAll(
      `SELECT ${
        vectorDistanceExpression("a.vec", "b.vec", "cosine")
      } FROM vectors a CROSS JOIN vectors b WHERE a.vertex=0 ORDER BY b.vertex`,
    ))
      .getRowsJS().map((row) => Number(row[0]));
    for (
      const [index, expected] of [
        0,
        1 - Math.SQRT1_2,
        1 - Math.SQRT1_2,
        2,
        1,
        0,
      ].entries()
    ) {
      assertAlmostEquals(distances[index], expected, 1e-14);
    }
    assertEquals(
      (await connection.runAndReadAll(
        "SELECT payload FROM vectors ORDER BY vertex",
      )).getRowsJS(),
      [["axis"], ["large"], ["tiny"], ["opposite"], ["orthogonal"], [
        "aligned",
      ]],
    );
    const before =
      (await connection.runAndReadAll("SELECT * FROM vectors ORDER BY vertex"))
        .getRowsJS();
    await stabilizeCosineVectors(connection, '"vectors"');
    assertEquals(
      (await connection.runAndReadAll("SELECT * FROM vectors ORDER BY vertex"))
        .getRowsJS(),
      before,
    );
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});

Deno.test("cosine preparation rejects invalid vectors before changing private rows", async () => {
  const db = await DuckDBInstance.create(":memory:");
  const connection = await db.connect();
  try {
    for (
      const invalid of [
        "[0,0]",
        "NULL",
        "[NULL,1]",
        "['NaN'::DOUBLE,1]",
        "['Infinity'::DOUBLE,1]",
      ]
    ) {
      await connection.run(
        `CREATE OR REPLACE TEMP TABLE vectors AS SELECT * FROM
        (VALUES (0,[1e308,1e308]::DOUBLE[2]),(1,${invalid}::DOUBLE[2])) t(vertex,vec)`,
      );
      await assertRejects(
        () => stabilizeCosineVectors(connection, '"vectors"'),
        Error,
        "finite, non-null values and nonzero vectors",
      );
      assertEquals(
        (await connection.runAndReadAll(
          "SELECT vec[1] FROM vectors WHERE vertex=0",
        )).getRowsJS(),
        [[1e308]],
      );
    }
  } finally {
    connection.closeSync();
    db.closeSync();
  }
});
