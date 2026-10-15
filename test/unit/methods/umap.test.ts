import { test, expect } from "vite-plus/test";
import { ok as assert } from "node:assert/strict";
import { assertRejects } from "../../helpers/assertions.ts";
import { mkdtemp as nodeMkdtemp, rm as nodeRm } from "node:fs/promises";
import { join as nodeJoin } from "node:path";
import { tmpdir as nodeTmpdir } from "node:os";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import type SimpleTable from "../../../src/class/SimpleTable.ts";

const data = [
  { id: "c", vector: [1, 2], rowid: "same", payload: "third" },
  { id: "a", vector: [1, 2], rowid: "same", payload: "duplicate" },
  { id: "b", vector: [3, 4], rowid: "same", payload: "second" },
  { id: "d", vector: [5, 6], rowid: "same", payload: "fourth" },
];
type Options = NonNullable<Parameters<SimpleTable["umap"]>[1]>;

async function noScratch(sdb: SimpleDB) {
  const c = sdb.connection!;
  const tables = (await c.runAndReadAll("SELECT table_name FROM duckdb_tables()"))
    .getRowsJS()
    .flat();
  assert(
    !tables.some((name) =>
      ["__sda_umap_", "__sda_features_"].some(
        (prefix) => typeof name === "string" && name.startsWith(prefix),
      ),
    ),
  );
  const indexes = (await c.runAndReadAll("SELECT index_name FROM duckdb_indexes()"))
    .getRowsJS()
    .flat();
  assert(!indexes.some((name) => typeof name === "string" && name.startsWith("__sda_umap_")));
}

test("umap chains between queued operations and preserves duplicate rows and types", async () => {
  const sdb = new SimpleDB();
  try {
    const options = { epochs: 20 };
    const table = sdb.newTable('source"table').loadArray([...data, data[0]], {
      columnTypes: { vector: "FLOAT[2]" },
    });
    expect(table.umap("VECTOR", options)).toStrictEqual(table);
    options.epochs = 0;
    const other = sdb.newTable("other").loadArray([{ value: 1 }]);
    const [rows, otherRows] = await Promise.all([table.getData(), other.getData()]);
    expect(otherRows).toStrictEqual([{ value: 1 }]);
    expect(rows.map(({ umapX: _x, umapY: _y, ...rest }) => rest)).toStrictEqual([...data, data[0]]);
    assert(rows.every((r) => Number.isFinite(r.umapX) && Number.isFinite(r.umapY)));
    expect((await table.getTypes()).vector).toStrictEqual("FLOAT[2]");
    expect((await table.getTypes()).umapX).toStrictEqual("DOUBLE");
    await table.selectColumns(["umapX", "umapY"]).run();
    expect(Object.keys(await table.getTypes())).toStrictEqual(["umapX", "umapY"]);
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

for (const metric of ["euclidean", "cosine"] as const) {
  for (const count of [16, 1001]) {
    test(`umap ${metric} with ${count} rows preserves data and repeats with the same input order`, async () => {
      const sdb = new SimpleDB();
      try {
        const sample = Array.from({ length: count }, (_, i) => ({
          id: i,
          vector: [i % 3, i + 1],
          payload: `row ${i}`,
        }));
        const options = {
          neighbors: 5,
          metric,
          epochs: 20,
          minDistance: 0.25,
        };
        const table = sdb.newTable("source").loadArray(sample, {
          columnTypes: { vector: "FLOAT[2]" },
        });
        await table.run();
        const c = sdb.connection!;
        await c.run(
          "SET threads=1; SET disabled_optimizers='filter_pushdown'; CREATE TABLE input AS SELECT * FROM source; CREATE TABLE umap_result AS SELECT 42 AS marker",
        );
        const before = (
          await c.runAndReadAll("SELECT current_setting('disabled_optimizers')")
        ).getRowsJS();
        const projected = await table.umap("vector", options).getData();
        expect(projected.map(({ umapX: _x, umapY: _y, ...row }) => row)).toStrictEqual(sample);
        assert(projected.every((row) => Number.isFinite(row.umapX) && Number.isFinite(row.umapY)));
        const actual = await table
          .selectColumns(["id", "umapX", "umapY"])
          .sort({ id: "asc" })
          .getData();
        const reordered = sdb
          .newTable("reordered")
          .loadArray([...sample].reverse(), { columnTypes: { vector: "FLOAT[2]" } });
        expect(
          await reordered
            .sort({ id: "asc" })
            .umap("vector", options)
            .selectColumns(["id", "umapX", "umapY"])
            .sort({ id: "asc" })
            .getData(),
        ).toStrictEqual(actual);
        expect(
          (await c.runAndReadAll("SELECT current_setting('disabled_optimizers')")).getRowsJS(),
        ).toStrictEqual(before);
        // Unrelated user tables must survive private scratch creation and cleanup.
        expect((await c.runAndReadAll("SELECT marker FROM umap_result")).getRowsJS()).toStrictEqual(
          [[42]],
        );
        expect((await c.runAndReadAll("SELECT * FROM input")).getRowObjectsJS()).toStrictEqual(
          sample,
        );
        await noScratch(sdb);
      } finally {
        await sdb.close();
      }
    });
  }
}

for (const [options, message] of [
  [{ neighbors: 1 }, "neighbors"],
  [{ epochs: 0 }, "epochs"],
  [{ negativeSamples: 0 }, "negativeSamples"],
  [{ learningRate: Infinity }, "learningRate"],
  [{ seed: 2 ** 32 }, "seed"],
  [{ minDistance: 1.1 }, "minDistance"],
] as [Options, string][]) {
  test(`umap rejects ${JSON.stringify(options)} without changing data`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray(data, {
        columnTypes: { vector: "FLOAT[2]" },
      });
      const before = await table.getData();
      await assertRejects(() => table.umap("vector", options).run(), Error, message);
      expect(await table.getData()).toStrictEqual(before);
      await noScratch(sdb);
    } finally {
      await sdb.close();
    }
  });
}

for (const [expression, options, message] of [
  ["NULL::DOUBLE[]", {}, "non-null"],
  ["[]::DOUBLE[]", {}, "empty vector"],
  ["[1,NULL]", {}, "finite"],
  ["[1,'NaN'::DOUBLE]", {}, "finite"],
  ["CASE WHEN i=0 THEN [1] ELSE [1,2] END", {}, "equal dimensions"],
  ["'hello'", {}, "numeric LIST or ARRAY"],
  ["[[1,2],[3,4]]", {}, "numeric LIST or ARRAY"],
  ["[0.,0.]", { metric: "cosine" }, "zero vector"],
  ["[1e200,1e200]", {}, "overflow"],
] as [string, Options, string][]) {
  test(`umap validates vectors: ${expression}`, async () => {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(
        `CREATE TABLE source AS SELECT ${expression} AS vector FROM range(4) t(i)`,
      );
      const table = sdb.newTable("source");
      const before = (await sdb.connection!.runAndReadAll("SELECT * FROM source")).getRowsJS();
      await assertRejects(
        () => table.umap("vector", { epochs: 10, ...options }).run(),
        Error,
        message,
      );
      expect(
        (await sdb.connection!.runAndReadAll("SELECT * FROM source")).getRowsJS(),
      ).toStrictEqual(before);
      await noScratch(sdb);
    } finally {
      await sdb.close();
    }
  });
}

test("umap rejects too few rows, including empty typed input", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source");
    for (const rows of [0, 1, 2]) {
      await sdb.customQuery(
        `CREATE OR REPLACE TABLE source AS SELECT [i,i+1] AS vector FROM range(${rows}) t(i)`,
      );
      await assertRejects(() => table.umap("vector").run(), Error, "between 3");
      await noScratch(sdb);
    }
  } finally {
    await sdb.close();
  }
});

test("umap preserves native indexes and typed payloads", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source").loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    await table.createVssIndex("vector").run();
    await sdb.customQuery("CREATE UNIQUE INDEX source_id ON source(id)");
    const definitions = structuredClone(table.indexes);
    const before = (
      await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() ORDER BY index_name",
      )
    ).getRowsJS();
    await table.umap("vector", { epochs: 10 }).run();
    expect(table.indexes).toStrictEqual(definitions);
    expect(
      (
        await sdb.connection!.runAndReadAll(
          "SELECT index_name FROM duckdb_indexes() ORDER BY index_name",
        )
      ).getRowsJS(),
    ).toStrictEqual(before);
    expect((await table.getTypes()).vector).toStrictEqual("FLOAT[2]");
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

test("umap reports publication failures and cleans scratch", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source").loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    await table.run();
    await sdb.customQuery("CREATE UNIQUE INDEX id_index ON source(id)");
    const original = table.runQuery;
    table.runQuery = async (...args) => {
      const result = await original(...args);
      if (args[3]?.method === "umap()") {
        throw new Error("Simulated publication failure");
      }
      return result;
    };
    await assertRejects(
      () => table.umap("vector", { epochs: 10 }).run(),
      Error,
      "Simulated publication failure",
    );
    table.runQuery = original;
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

test("umap preserves JSON, exact decimals, big integers and geometry CRS", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`INSTALL spatial; LOAD spatial;
      CREATE TABLE source AS SELECT i AS id,[i,i+1] AS vector,
      1234567890123456789::BIGINT AS large, 123456789.123456789::DECIMAL(18,9) AS precise,
      '{"list":[1,2]}'::JSON AS payload,
      ST_Point(i,i)::GEOMETRY('EPSG:4326') AS geom FROM range(4) t(i)`);
    const table = sdb.newTable("source");
    const types = await table.getTypes();
    const before = (await sdb.connection!.runAndReadAll("SELECT * FROM source")).getRowsJS();
    await table.umap("vector", { epochs: 10 }).run();
    const { umapX: _x, umapY: _y, ...afterTypes } = await table.getTypes();
    expect(afterTypes).toStrictEqual(types);
    expect(
      (
        await sdb.connection!.runAndReadAll("SELECT * EXCLUDE(umapX,umapY) FROM source")
      ).getRowsJS(),
    ).toStrictEqual(before);
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

test("umap handles three rows with automatic neighbor search", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = await sdb
      .newTable()
      .loadArray(data.slice(0, 3), {
        columnTypes: { vector: "FLOAT[2]" },
      })
      .umap("vector", { epochs: 10 })
      .getData();
    expect(rows.length).toStrictEqual(3);
    assert(rows.every((row) => Number.isFinite(row.umapX) && Number.isFinite(row.umapY)));
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

test("umap supports temporary source tables and HNSW in file databases", async () => {
  const directory = await nodeMkdtemp(nodeJoin(nodeTmpdir(), "sda-test-"));
  const sdb = new SimpleDB({ file: `${directory}/umap.duckdb` });
  try {
    await sdb.customQuery(
      `CREATE TEMP TABLE source AS SELECT [i,i+1] AS vector FROM range(1001) t(i)`,
    );
    const table = sdb.newTable("source");
    await table.umap("vector", { epochs: 10, neighbors: 5 }).run();
    expect(
      (
        await sdb.connection!.runAndReadAll(
          "SELECT temporary FROM duckdb_tables() WHERE table_name='source'",
        )
      ).getRowsJS(),
    ).toStrictEqual([[true]]);
    const persistent = sdb.newTable("persistent").loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    await persistent
      .umap("vector", {
        epochs: 10,
        neighbors: 2,
      })
      .run();
    await noScratch(sdb);
  } finally {
    await sdb.close();
    await nodeRm(directory, { recursive: true });
  }
});

for (const column of ["umapX", "umapY", "UMAPX", "umapy"]) {
  test(`umap rejects an existing ${column} column without changing data`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray(
        data.map((row) => ({ ...row, [column]: 7 })),
        {
          columnTypes: { vector: "FLOAT[2]" },
        },
      );
      const before = await table.getData();
      await assertRejects(() => table.umap("vector").run(), Error, "output columns");
      expect(await table.getData()).toStrictEqual(before);
      await noScratch(sdb);
    } finally {
      await sdb.close();
    }
  });
}

test("umap rejects a missing embedding column", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    const before = await table.getData();
    await assertRejects(() => table.umap("missing").run(), Error, "could not find column");
    expect(await table.getData()).toStrictEqual(before);
  } finally {
    await sdb.close();
  }
});

test("umap validates FLOAT norms for automatic indexed search on larger tables", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery("CREATE TABLE source AS SELECT [1e30,1e30] AS vector FROM range(1001)");
    const table = sdb.newTable("source");
    const before = await table.getTypes();
    await assertRejects(() => table.umap("vector").run(), Error, "FLOAT norms");
    expect(await table.getTypes()).toStrictEqual(before);
    expect(await table.getRowCount()).toStrictEqual(1001);
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

for (const metric of ["euclidean", "cosine"] as const) {
  for (const count of [16, 1001]) {
    test(`umap scalar columns match vectors for ${metric} with ${count} rows`, async () => {
      const sdb = new SimpleDB();
      try {
        await sdb.customQuery(`SET threads=1;
          CREATE TABLE scalars AS SELECT i AS id, i%3 AS "2",
            (i+1)::DECIMAL(10,2) AS "1", 'same' AS rowid,
            'payload' AS "quoted""name" FROM range(${count}) t(i);
          CREATE TABLE vectors AS SELECT ["1"::DOUBLE,"2"::DOUBLE] AS vector
            FROM scalars ORDER BY id`);
        const table = sdb.newTable("scalars");
        const before = await table.getData();
        const types = await table.getTypes();
        const columnOrder = await table.getColumns();
        const columns = ["1", "2"];
        const options = { metric, epochs: 10, neighbors: 5, seed: 7 };
        expect(table.umap(columns, options)).toStrictEqual(table);
        columns[0] = "missing";
        const actual = await table.getData();
        const expected = await sdb
          .newTable("vectors")
          .umap("vector", options)
          .selectColumns(["umapX", "umapY"])
          .getData();
        expect(actual.map(({ umapX, umapY }) => ({ umapX, umapY }))).toStrictEqual(expected);
        expect(actual.map(({ umapX: _x, umapY: _y, ...row }) => row)).toStrictEqual(before);
        expect(await table.getTypes()).toStrictEqual({
          ...types,
          umapX: "DOUBLE",
          umapY: "DOUBLE",
        });
        expect(await table.getColumns()).toStrictEqual([...columnOrder, "umapX", "umapY"]);
        await noScratch(sdb);
      } finally {
        await sdb.close();
      }
    });
  }
}

test("umap accepts a single scalar feature and resolves quoted column names case-insensitively", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = [{ 'a"B': 1 }, { 'a"B': 1 }, { 'a"B': 3 }, { 'a"B': 4 }];
    const options = { epochs: 10 };
    const actual = await sdb.newTable().loadArray(rows).umap(['A"b'], options).getData();
    const expected = await sdb
      .newTable()
      .loadArray(
        rows.map((row) => ({ vector: [row['a"B']] })),
        { columnTypes: { vector: "FLOAT[1]" } },
      )
      .umap("vector", options)
      .selectColumns(["umapX", "umapY"])
      .getData();
    expect(actual.map(({ umapX, umapY }) => ({ umapX, umapY }))).toStrictEqual(expected);
    expect(actual.map(({ umapX: _x, umapY: _y, ...row }) => row)).toStrictEqual(rows);
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

for (const [columns, expression, options, message] of [
  [[], "i", {}, "at least one numeric scalar column"],
  [["missing"], "i", {}, "could not find column"],
  [["x", "X"], "i", {}, "duplicate input column"],
  [["x"], "'text'", {}, "numeric scalar columns"],
  [["x"], "[i,i+1]", {}, "numeric scalar columns"],
  [["x"], "NULL::DOUBLE", {}, "finite, non-null"],
  [["x"], "'NaN'::DOUBLE", {}, "finite, non-null"],
  [["x"], "'Infinity'::DOUBLE", {}, "finite, non-null"],
  [["x"], "0", { metric: "cosine" }, "zero vector"],
  [["x"], "1e200", {}, "overflow"],
] as [string[], string, Options, string][]) {
  test(`umap validates scalar columns ${JSON.stringify(columns)} with ${expression}`, async () => {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(
        `CREATE TABLE source AS SELECT ${expression} AS x, i AS valid FROM range(4) t(i)`,
      );
      const table = sdb.newTable("source");
      const before = (await sdb.connection!.runAndReadAll("SELECT * FROM source")).getRowsJS();
      const types = await table.getTypes();
      await assertRejects(
        () => table.umap(columns, { epochs: 10, ...options }).run(),
        Error,
        message,
      );
      expect(
        (await sdb.connection!.runAndReadAll("SELECT * FROM source")).getRowsJS(),
      ).toStrictEqual(before);
      expect(await table.getTypes()).toStrictEqual(types);
      await noScratch(sdb);
      await table.umap(["valid"], { epochs: 10 }).run();
      expect(await table.getRowCount()).toStrictEqual(4);
      await noScratch(sdb);
    } finally {
      await sdb.close();
    }
  });
}
