import { assertEquals, assertRejects } from "@std/assert";
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
        "could not restore an existing DuckDB index",
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
