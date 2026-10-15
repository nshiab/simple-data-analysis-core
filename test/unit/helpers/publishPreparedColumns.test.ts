import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import prepareNumericFeatures from "../../../src/helpers/prepareNumericFeatures.ts";
import publishPreparedColumns from "../../../src/helpers/publishPreparedColumns.ts";

test("publishPreparedColumns reports an index recreation failure", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`CREATE TABLE source AS SELECT * FROM (VALUES
      (1, [10,100]::INTEGER[2]),
      (2, [20,200]::INTEGER[2])
    ) rows(id,features);
    CREATE UNIQUE INDEX source_id ON source(id)`);
    const table = sdb.newTable("source");
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
        "Data contains duplicates on indexed column(s)",
      );
    } finally {
      await prepared.cleanup();
    }
    expect(
      (
        await sdb.connection!.runAndReadAll(
          "SELECT table_name FROM duckdb_tables() WHERE temporary",
        )
      ).getRowsJS(),
    ).toStrictEqual([]);
  } finally {
    await sdb.close();
  }
});

test("publishPreparedColumns rejects a replacement whose output name would be ignored", async () => {
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
            outputs: [
              {
                name: "scaled",
                expression: "[0]::DOUBLE[1]",
                replace: "features",
              },
            ],
          }),
        Error,
        "must match its replacement column",
      );
    } finally {
      await prepared.cleanup();
    }
    expect(await table.getData()).toStrictEqual(before);
  } finally {
    await sdb.close();
  }
});
