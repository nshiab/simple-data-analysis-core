import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("rowToVector preserves matching FLOAT type, order, rows, and null elements", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS
      SELECT * FROM (VALUES
        ('first', 1::FLOAT, 2::FLOAT),
        ('second', NULL::FLOAT, 4::FLOAT)
      ) AS rows(label, x, y)`);
    const table = sdb.newTable("source");

    assertEquals(table.rowToVector(["y", "x"], "vector"), table);
    assertEquals(await table.getData(), [
      { label: "first", x: 1, y: 2, vector: [2, 1] },
      { label: "second", x: null, y: 4, vector: [4, null] },
    ]);
    assertEquals(await table.getTypes(), {
      label: "VARCHAR",
      x: "FLOAT",
      y: "FLOAT",
      vector: "FLOAT[2]",
    });
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector preserves matching integer and exact decimal element types", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      1::INTEGER AS i1, 2::INTEGER AS i2,
      1.25::DECIMAL(8,2) AS d1, 2.50::DECIMAL(8,2) AS d2`);
    const table = sdb.newTable("source");
    table.rowToVector(["i1", "i2"], "integers")
      .rowToVector(["d1", "d2"], "decimals");

    assertEquals(await table.getTypes(), {
      i1: "INTEGER",
      i2: "INTEGER",
      d1: "DECIMAL(8,2)",
      d2: "DECIMAL(8,2)",
      integers: "INTEGER[2]",
      decimals: "DECIMAL(8,2)[2]",
    });
    const rows = (await sdb.connection!.runAndReadAll(
      "SELECT integers[1], integers[2], decimals[1], decimals[2] FROM source",
    )).getRowsJS();
    assertEquals(rows[0].slice(0, 2), [1, 2]);
    assertEquals(rows[0].slice(2).map(String), ["1.25", "2.5"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector explicitly casts mixed numeric inputs to FLOAT or DOUBLE", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      "CREATE TABLE source AS SELECT 1::INTEGER AS count, 2.5::DOUBLE AS score",
    );
    const floatTable = sdb.newTable("source");
    await floatTable.rowToVector(["count", "score"], "features", {
      type: "float",
    }).run();
    assertEquals((await floatTable.getTypes()).features, "FLOAT[2]");

    await sdb.customQuery(
      "CREATE OR REPLACE TABLE source AS SELECT 1::INTEGER AS count, 2.5::FLOAT AS score",
    );
    const doubleTable = floatTable;
    await doubleTable.rowToVector(["count", "score"], "features", {
      type: "double",
    }).run();
    assertEquals((await doubleTable.getTypes()).features, "DOUBLE[2]");
    assertEquals(await doubleTable.getData(), [{
      count: 1,
      score: 2.5,
      features: [1, 2.5],
    }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector rejects mixed scalar and mismatched decimal types without an explicit type", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      1::INTEGER AS integer_value, 2::DOUBLE AS double_value,
      1.2::DECIMAL(8,1) AS decimal_a,
      2.30::DECIMAL(8,2) AS decimal_b,
      3.4::DECIMAL(9,1) AS decimal_c`);
    const table = sdb.newTable("source");

    await assertRejects(
      () => table.rowToVector(["integer_value", "double_value"], "mixed").run(),
      Error,
      '"integer_value" (INTEGER), "double_value" (DOUBLE)',
    );
    await assertRejects(
      () => table.rowToVector(["decimal_a", "decimal_b"], "mixed").run(),
      Error,
      'Set options.type to "float" or "double"',
    );
    await assertRejects(
      () => table.rowToVector(["decimal_a", "decimal_c"], "mixed").run(),
      Error,
      'Set options.type to "float" or "double"',
    );
    assertEquals(Object.keys(await table.getTypes()), [
      "integer_value",
      "double_value",
      "decimal_a",
      "decimal_b",
      "decimal_c",
    ]);
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector safely quotes names and chains between queued operations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable('source"table').loadArray([
      { 'first"value': 1, second: 2, keep: "yes" },
      { 'first"value': 3, second: 4, keep: "yes" },
    ], {
      columnTypes: { 'first"value': "INTEGER", second: "INTEGER" },
    });
    const columns = ["SECOND", 'FIRST"VALUE'];
    const options: { type?: "float" | "double" } = { type: "double" };
    table.selectRows(1)
      .rowToVector(columns, 'new"vector', options)
      .selectColumns(["keep", 'new"vector']);
    columns.reverse();
    options.type = "float";

    assertEquals(await table.getData(), [{
      keep: "yes",
      'new"vector': [2, 1],
    }]);
    assertEquals((await table.getTypes())['new"vector'], "DOUBLE[2]");
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector rejects invalid arguments and columns", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{
      number: 1,
      text: "one",
      existing: "keep",
    }], { columnTypes: { number: "INTEGER" } });

    assertThrows(
      () => table.rowToVector([], "vector"),
      Error,
      "at least one numeric scalar input column",
    );
    assertThrows(
      () => table.rowToVector(["number", "NUMBER"], "vector"),
      Error,
      "duplicate input column",
    );
    assertThrows(
      () =>
        table.rowToVector(["number"], "vector", {
          type: "half" as "float",
        }),
      Error,
      'options.type must be "float" or "double"',
    );

    await assertRejects(
      () => table.rowToVector(["missing"], "vector").run(),
      Error,
      'the column "missing" does not exist',
    );
    await assertRejects(
      () => table.rowToVector(["text"], "vector").run(),
      Error,
      '"text" (VARCHAR)',
    );
    await assertRejects(
      () => table.rowToVector(["number"], "EXISTING").run(),
      Error,
      'the column "EXISTING" already exists',
    );
    assertEquals(await table.getData(), [{
      number: 1,
      text: "one",
      existing: "keep",
    }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector casts each mixed decimal and integer input before combining", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      0.125::DECIMAL(38,38) AS fraction, 123::HUGEINT AS integer`);
    const table = sdb.newTable("source");
    await table.rowToVector(["fraction", "integer"], "vector", {
      type: "double",
    }).run();
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT vector[1], vector[2], fraction::VARCHAR, integer::VARCHAR FROM source",
      )).getRowsJS(),
      [[0.125, 123, ".12500000000000000000000000000000000000", "123"]],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector matches ASCII identifiers while keeping Unicode names distinct", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(
      'CREATE TABLE source AS SELECT 1 AS "Ä", 2 AS "ä", 3 AS "É"',
    );
    const table = sdb.newTable("source");
    await table.rowToVector(["ä", "Ä"], "é").run();
    assertEquals(await table.getData(), [{ Ä: 1, ä: 2, É: 3, é: [2, 1] }]);
    await assertRejects(
      () => table.rowToVector(["constructor"], "missing").run(),
      Error,
      'the column "constructor" does not exist',
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector preserves every matching DuckDB integer width and BIGNUM", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    for (
      const type of [
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
        "DOUBLE",
      ]
    ) {
      await sdb.customQuery(
        `CREATE OR REPLACE TABLE source AS SELECT 1::${type} AS a, 2::${type} AS b`,
      );
      await table.rowToVector(["b", "a"], "vector").run();
      assertEquals((await table.getTypes()).vector, `${type}[2]`);
      assertEquals(
        (await sdb.connection!.runAndReadAll(
          "SELECT vector[1]::INTEGER, vector[2]::INTEGER FROM source",
        )).getRowsJS(),
        [[2, 1]],
      );
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector conversion failure preserves source data and aborts later queued output", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source").loadArray([{ huge: 1e100, small: 2 }]);
    await table.run();
    const types = await table.getTypes();
    await assertRejects(() =>
      table.rowToVector(["huge"], "overflow", {
        type: "float",
      }).rowToVector(["small"], "later").run()
    );
    assertEquals(await table.getTypes(), types);
    assertEquals(await table.getData(), [{ huge: 1e100, small: 2 }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("rowToVector supports explicit FLOAT and DOUBLE conversion from BIGNUM", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery("CREATE TABLE source AS SELECT 123::BIGNUM AS value");
    const table = sdb.newTable("source");
    await table.rowToVector(["value"], "floats", { type: "float" })
      .rowToVector(["value"], "doubles", { type: "double" }).run();
    assertEquals(await table.getTypes(), {
      value: "BIGNUM",
      floats: "FLOAT[1]",
      doubles: "DOUBLE[1]",
    });
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT value::VARCHAR, floats[1], doubles[1] FROM source",
      )).getRowsJS(),
      [["123", 123, 123]],
    );
  } finally {
    await sdb.close();
  }
});
