import { assert, assertEquals, assertRejects } from "@std/assert";
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
  const tables =
    (await c.runAndReadAll("SELECT table_name FROM duckdb_tables()"))
      .getRowsJS().flat();
  assert(!tables.some((name) => String(name).startsWith("__sda_umap_")));
  const indexes =
    (await c.runAndReadAll("SELECT index_name FROM duckdb_indexes()"))
      .getRowsJS().flat();
  assert(!indexes.some((name) => String(name).startsWith("__sda_umap_")));
}

Deno.test("umap chains between queued operations and preserves duplicate rows and types", async () => {
  const sdb = new SimpleDB();
  try {
    const options = { epochs: 20, xColumn: 'x"axis', yColumn: "y axis" };
    const table = sdb.newTable('source"table').loadArray([...data, data[0]], {
      columnTypes: { vector: "FLOAT[2]" },
    });
    assertEquals(table.umap("VECTOR", options), table);
    options.xColumn = "changed_after_queueing";
    const other = sdb.newTable("other").loadArray([{ value: 1 }]);
    const [rows, otherRows] = await Promise.all([
      table.getData(),
      other.getData(),
    ]);
    assertEquals(otherRows, [{ value: 1 }]);
    assertEquals(rows.map(({ 'x"axis': _x, "y axis": _y, ...rest }) => rest), [
      ...data,
      data[0],
    ]);
    assert(
      rows.every((r) =>
        Number.isFinite(r['x"axis']) && Number.isFinite(r["y axis"])
      ),
    );
    assertEquals((await table.getTypes()).vector, "FLOAT[2]");
    assertEquals((await table.getTypes())['x"axis'], "DOUBLE");
    await table.selectColumns(['x"axis', "y axis"]).run();
    assertEquals(Object.keys(await table.getTypes()), ['x"axis', "y axis"]);
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

for (const metric of ["euclidean", "cosine"] as const) {
  for (const search of ["exact", "hnsw"] as const) {
    Deno.test(`umap ${metric}/${search} preserves data and stable IDs across reordered inputs`, async () => {
      const sdb = new SimpleDB();
      try {
        const sample = Array.from({ length: 16 }, (_, i) => ({
          id: i,
          vector: [i % 3, i + 1],
          payload: `row ${i}`,
        }));
        const options = {
          neighbors: 5,
          metric,
          search,
          epochs: 20,
          minDistance: 0.25,
          idColumn: "id",
        };
        const table = sdb.newTable("source").loadArray(sample, {
          columnTypes: { vector: "FLOAT[2]" },
        });
        await table.run();
        const c = sdb.connection!;
        await c.run(
          "SET threads=1; SET disabled_optimizers='filter_pushdown'; CREATE TABLE input AS SELECT * FROM source; CREATE TABLE umap_result AS SELECT 42 AS marker",
        );
        const before = (await c.runAndReadAll(
          "SELECT current_setting('disabled_optimizers')",
        )).getRowsJS();
        const projected = await table.umap("vector", options).getData();
        assertEquals(
          projected.map(({ umapX: _x, umapY: _y, ...row }) => row),
          sample,
        );
        assert(
          projected.every((row) =>
            Number.isFinite(row.umapX) && Number.isFinite(row.umapY)
          ),
        );
        const actual = await table.selectColumns([
          "id",
          "umapX",
          "umapY",
        ]).sort({ id: "asc" }).getData();
        const reordered = sdb.newTable("reordered").loadArray(
          [...sample].reverse(),
          { columnTypes: { vector: "FLOAT[2]" } },
        );
        assertEquals(
          await reordered.umap("vector", options).selectColumns([
            "id",
            "umapX",
            "umapY",
          ]).sort({ id: "asc" }).getData(),
          actual,
        );
        assertEquals(
          (await c.runAndReadAll(
            "SELECT current_setting('disabled_optimizers')",
          )).getRowsJS(),
          before,
        );
        // Unrelated user tables must survive private scratch creation and cleanup.
        assertEquals(
          (await c.runAndReadAll(
            "SELECT marker FROM umap_result",
          )).getRowsJS(),
          [[42]],
        );
        assertEquals(
          (await c.runAndReadAll("SELECT * FROM input")).getRowObjectsJS(),
          sample,
        );
        await noScratch(sdb);
      } finally {
        await sdb.close();
      }
    });
  }
}

for (
  const [options, message] of [
    [{ neighbors: 1 }, "neighbors"],
    [{ epochs: 0 }, "epochs"],
    [{ negativeSamples: 0 }, "negativeSamples"],
    [{ learningRate: Infinity }, "learningRate"],
    [{ seed: 2 ** 32 }, "seed"],
    [{ minDistance: 1.1 }, "minDistance"],
    [{ xColumn: "VECTOR" }, "output columns"],
    [{ xColumn: "Y", yColumn: "y" }, "output columns"],
    [{ xColumn: "" }, "output columns"],
    [{ idColumn: "rowid" }, "unique and non-null"],
    [{ idColumn: "missing" }, "does not exist"],
  ] as [Options, string][]
) {
  Deno.test(`umap rejects ${JSON.stringify(options)} without changing data`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable().loadArray(data, {
        columnTypes: { vector: "FLOAT[2]" },
      });
      const before = await table.getData();
      await assertRejects(
        () => table.umap("vector", options).run(),
        Error,
        message,
      );
      assertEquals(await table.getData(), before);
      await noScratch(sdb);
    } finally {
      await sdb.close();
    }
  });
}

for (
  const [expression, options, message] of [
    ["NULL::DOUBLE[]", {}, "nonempty"],
    ["[]::DOUBLE[]", {}, "nonempty"],
    ["[1,NULL]", {}, "finite"],
    ["[1,'NaN'::DOUBLE]", {}, "finite"],
    ["CASE WHEN i=0 THEN [1] ELSE [1,2] END", {}, "equal dimensions"],
    ["'hello'", {}, "numeric LIST or ARRAY"],
    ["[[1,2],[3,4]]", {}, "numeric LIST or ARRAY"],
    ["[0.,0.]", { metric: "cosine" }, "zero vector"],
    ["[1e200,1e200]", {}, "overflow"],
    ["[1e30,1e30]", { search: "hnsw" }, "FLOAT norms"],
  ] as [string, Options, string][]
) {
  Deno.test(`umap validates vectors: ${expression}`, async () => {
    const sdb = new SimpleDB();
    try {
      await sdb.customQuery(
        `CREATE TABLE source AS SELECT ${expression} AS vector FROM range(4) t(i)`,
      );
      const table = sdb.newTable("source");
      const before =
        (await sdb.connection!.runAndReadAll("SELECT * FROM source"))
          .getRowsJS();
      await assertRejects(
        () => table.umap("vector", { epochs: 10, ...options }).run(),
        Error,
        message,
      );
      assertEquals(
        (await sdb.connection!.runAndReadAll("SELECT * FROM source"))
          .getRowsJS(),
        before,
      );
      await noScratch(sdb);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("umap rejects too few rows, including empty typed input", async () => {
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

Deno.test("umap cancellation preserves data and cleans scratch", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    const before = await table.getData();
    await assertRejects(() =>
      table.umap("vector", { signal: AbortSignal.abort() }).run()
    );
    assertEquals(await table.getData(), before);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 50);
    try {
      await assertRejects(() =>
        table.umap("vector", { epochs: 100000, signal: controller.signal })
          .run()
      );
    } finally {
      clearTimeout(timer);
    }
    assertEquals(await table.getData(), before);
    await noScratch(sdb);
    // A cancelled fit must not poison the connection or subsequent fits.
    await table.umap("vector", { epochs: 10 }).run();
  } finally {
    await sdb.close();
  }
});

Deno.test("umap preserves native indexes and typed payloads", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source").loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    await table.createVssIndex("vector").run();
    await sdb.customQuery("CREATE UNIQUE INDEX source_id ON source(id)");
    const definitions = structuredClone(table.indexes);
    const before = (await sdb.connection!.runAndReadAll(
      "SELECT index_name FROM duckdb_indexes() ORDER BY index_name",
    )).getRowsJS();
    await table.umap("vector", { epochs: 10 }).run();
    assertEquals(table.indexes, definitions);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes() ORDER BY index_name",
      )).getRowsJS(),
      before,
    );
    assertEquals((await table.getTypes()).vector, "FLOAT[2]");
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

Deno.test("umap rolls back publication failures and restores indexes", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("source").loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    const before = await table.getData();
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
    assertEquals(await table.getData(), before);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT index_name FROM duckdb_indexes()",
      )).getRowsJS(),
      [["id_index"]],
    );
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

Deno.test("umap preserves JSON, exact decimals, big integers and geometry CRS", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery(`INSTALL spatial; LOAD spatial;
      CREATE TABLE source AS SELECT i AS id,[i,i+1] AS vector,
      1234567890123456789::BIGINT AS large, 123456789.123456789::DECIMAL(18,9) AS precise,
      '{"list":[1,2]}'::JSON AS payload,
      ST_Point(i,i)::GEOMETRY('EPSG:4326') AS geom FROM range(4) t(i)`);
    const table = sdb.newTable("source");
    const types = await table.getTypes();
    const before = (await sdb.connection!.runAndReadAll("SELECT * FROM source"))
      .getRowsJS();
    await table.umap("vector", { epochs: 10 }).run();
    const { umapX: _x, umapY: _y, ...afterTypes } = await table.getTypes();
    assertEquals(afterTypes, types);
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT * EXCLUDE(umapX,umapY) FROM source",
      )).getRowsJS(),
      before,
    );
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

Deno.test("umap HNSW handles three rows with a bounded exact fallback", async () => {
  const sdb = new SimpleDB();
  try {
    const rows = await sdb.newTable().loadArray(data.slice(0, 3), {
      columnTypes: { vector: "FLOAT[2]" },
    })
      .umap("vector", { search: "hnsw", epochs: 10 }).getData();
    assertEquals(rows.length, 3);
    assert(
      rows.every((row) =>
        Number.isFinite(row.umapX) && Number.isFinite(row.umapY)
      ),
    );
    await noScratch(sdb);
  } finally {
    await sdb.close();
  }
});

Deno.test("umap supports temporary source tables and HNSW in file databases", async () => {
  const directory = await Deno.makeTempDir();
  const sdb = new SimpleDB({ file: `${directory}/umap.duckdb` });
  try {
    await sdb.customQuery(
      `CREATE TEMP TABLE source AS SELECT [i,i+1] AS vector FROM range(16) t(i)`,
    );
    const table = sdb.newTable("source");
    await table.umap("vector", { search: "hnsw", epochs: 10, neighbors: 5 })
      .run();
    assertEquals(
      (await sdb.connection!.runAndReadAll(
        "SELECT temporary FROM duckdb_tables() WHERE table_name='source'",
      )).getRowsJS(),
      [[true]],
    );
    const persistent = sdb.newTable("persistent").loadArray(data, {
      columnTypes: { vector: "FLOAT[2]" },
    });
    await persistent.umap("vector", {
      search: "hnsw",
      epochs: 10,
      neighbors: 2,
    }).run();
    await noScratch(sdb);
  } finally {
    await sdb.close();
    await Deno.remove(directory, { recursive: true });
  }
});
