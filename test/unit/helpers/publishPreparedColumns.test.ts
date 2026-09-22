import { assertEquals, assertRejects, assertStrictEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import prepareNumericFeatures from "../../../src/helpers/prepareNumericFeatures.ts";
import publishPreparedColumns from "../../../src/helpers/publishPreparedColumns.ts";

Deno.test("publishPreparedColumns rolls back an index recreation failure", async () => {
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
    const prepared = await prepareNumericFeatures(
      table,
      { kind: "vector", column: "features" },
      { method: "testPublication()" },
    );
    try {
      await assertRejects(
        () =>
          publishPreparedColumns(table, prepared, {
            method: "testPublication()",
            parameters: null,
            outputs: [{ name: "id", expression: "0", replace: "id" }],
          }),
        Error,
        "PRIMARY KEY or UNIQUE constraint violation",
      );
    } finally {
      await prepared.cleanup();
    }
    assertEquals(await table.getData(), before);
    assertEquals(await table.getTypes(), types);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes()",
      )).getRowsJS(),
      [["source_id"]],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("publishPreparedColumns preserves unrelated commit errors and rolls back indexes and data", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT i AS id,
      [i]::DOUBLE[1] AS features FROM range(2) rows(i);
      CREATE UNIQUE INDEX source_id ON source(id)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const types = await table.getTypes();
    const prepared = await prepareNumericFeatures(
      table,
      { kind: "vector", column: "features" },
      { method: "testPublication()" },
    );
    const connection = sdb.connection!;
    const original = connection.run;
    const failure = new Error("Simulated storage failure at commit");
    connection.run = function (...args) {
      if (args[0] === "COMMIT") return Promise.reject(failure);
      return original.apply(this, args);
    };
    try {
      const error = await assertRejects(() =>
        publishPreparedColumns(table, prepared, {
          method: "testPublication()",
          parameters: null,
          outputs: [{ name: "scaled", expression: "p.features" }],
        })
      );
      assertStrictEquals(error, failure);
    } finally {
      connection.run = original;
      await prepared.cleanup();
    }
    assertEquals(await table.getData(), before);
    assertEquals(await table.getTypes(), types);
    assertEquals(
      (await connection.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes()",
      )).getRowsJS(),
      [["source_id"]],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("publishPreparedColumns rejects a replacement whose output name would be ignored", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT
      [i]::DOUBLE[1] AS features FROM range(2) rows(i)`);
    const table = sdb.newTable("source");
    const before = await table.getData();
    const prepared = await prepareNumericFeatures(
      table,
      { kind: "vector", column: "features" },
      { method: "testPublication()" },
    );
    try {
      await assertRejects(
        () =>
          publishPreparedColumns(table, prepared, {
            method: "testPublication()",
            parameters: null,
            outputs: [{
              name: "scaled",
              expression: "[0]::DOUBLE[1]",
              replace: "features",
            }],
          }),
        Error,
        "must match its replacement column",
      );
    } finally {
      await prepared.cleanup();
    }
    assertEquals(await table.getData(), before);
  } finally {
    await sdb.close();
  }
});
