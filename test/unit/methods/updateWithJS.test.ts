import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should update the data from the table with a javascript function and reinsert it into the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.json");
  table.updateWithJS((rows) => {
    const modifiedRows = rows.map((d) => ({
      Name: typeof d.Name === "string" ? d.Name.slice(0, 4) : d.Name,
    }));

    return modifiedRows;
  });

  const data = await table.getData();

  assertEquals(data, [
    { Name: "OCon" },
    { Name: "OCon" },
    { Name: "Gran" },
    { Name: null },
    { Name: "Hart" },
    { Name: "Fay," },
    { Name: "Mavr" },
    { Name: null },
    { Name: "Higg" },
    { Name: null },
    { Name: "King" },
    { Name: "Koch" },
    { Name: "De H" },
    { Name: "Huno" },
    { Name: "Erns" },
    { Name: "Aust" },
    { Name: "Pata" },
    { Name: "Lore" },
    { Name: "Gree" },
    { Name: "Favi" },
    { Name: "Chen" },
    { Name: "Scia" },
    { Name: "Urma" },
    { Name: "Popp" },
    { Name: "Raph" },
    { Name: "Khoo" },
    { Name: "Baid" },
    { Name: "Tobi" },
    { Name: "Himu" },
    { Name: "Colm" },
    { Name: "Weis" },
    { Name: "Frip" },
    { Name: "Kauf" },
    { Name: "Voll" },
    { Name: "Mour" },
    { Name: "Naye" },
    { Name: "Mikk" },
    { Name: "Land" },
    { Name: "Mark" },
    { Name: "Biss" },
    { Name: "Atki" },
    { Name: "Marl" },
    { Name: "Olso" },
    { Name: null },
    { Name: "Roge" },
    { Name: "Gee," },
    { Name: "Phil" },
    { Name: "Ladw" },
    { Name: "Stil" },
    { Name: "Seo," },
    { Name: "Pate" },
  ]);

  await sdb.close();
});

Deno.test("should update the data from the table with an async javascript function and reinsert it into the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.json");
  table.updateWithJS(async (rows) => {
    await Promise.resolve();
    const modifiedRows = rows.map((d) => ({
      Name: typeof d.Name === "string" ? d.Name.slice(0, 4) : d.Name,
    }));

    return modifiedRows;
  });

  const data = await table.getData();

  assertEquals(data, [
    { Name: "OCon" },
    { Name: "OCon" },
    { Name: "Gran" },
    { Name: null },
    { Name: "Hart" },
    { Name: "Fay," },
    { Name: "Mavr" },
    { Name: null },
    { Name: "Higg" },
    { Name: null },
    { Name: "King" },
    { Name: "Koch" },
    { Name: "De H" },
    { Name: "Huno" },
    { Name: "Erns" },
    { Name: "Aust" },
    { Name: "Pata" },
    { Name: "Lore" },
    { Name: "Gree" },
    { Name: "Favi" },
    { Name: "Chen" },
    { Name: "Scia" },
    { Name: "Urma" },
    { Name: "Popp" },
    { Name: "Raph" },
    { Name: "Khoo" },
    { Name: "Baid" },
    { Name: "Tobi" },
    { Name: "Himu" },
    { Name: "Colm" },
    { Name: "Weis" },
    { Name: "Frip" },
    { Name: "Kauf" },
    { Name: "Voll" },
    { Name: "Mour" },
    { Name: "Naye" },
    { Name: "Mikk" },
    { Name: "Land" },
    { Name: "Mark" },
    { Name: "Biss" },
    { Name: "Atki" },
    { Name: "Marl" },
    { Name: "Olso" },
    { Name: null },
    { Name: "Roge" },
    { Name: "Gee," },
    { Name: "Phil" },
    { Name: "Ladw" },
    { Name: "Stil" },
    { Name: "Seo," },
    { Name: "Pate" },
  ]);

  await sdb.close();
});
Deno.test("should produce the same result with and without batchSize", async () => {
  const sdb = new SimpleDB();
  const data = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    value: i * 10,
    date: new Date(Date.UTC(2020, 0, 1 + i)),
    label: i % 3 === 0 ? null : `label-${i}`,
  }));
  const modifier = (rows: { [key: string]: unknown }[]) =>
    rows.map((d) => ({
      ...d,
      value: typeof d.value === "number" ? d.value + 1 : null,
    }));

  const plain = sdb.newTable("plain");
  plain.loadArray(data);
  plain.updateWithJS(modifier);

  const batched = sdb.newTable("batched");
  batched.loadArray(data);
  batched.updateWithJS(modifier, { batchSize: 4 });

  assertEquals(await batched.getData(), await plain.getData());
  await sdb.close();
});

Deno.test("should call the modifier once per batch", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("batchCalls");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  const batchSizes: number[] = [];
  table.updateWithJS((rows) => {
    batchSizes.push(rows.length);
    return rows;
  }, { batchSize: 4 });

  assertEquals(await table.getRowCount(), 10);
  assertEquals(batchSizes, [4, 4, 2]);
  await sdb.close();
});

Deno.test("batched updates preserve sparse cursors, partial batches, and consumed input", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("sparse");
    await sdb.customQuery(
      "CREATE TABLE sparse AS SELECT i::INTEGER AS id FROM range(5008) t(i)",
    );
    await sdb.customQuery("DELETE FROM sparse WHERE id % 1001 = 0");
    const batchSizes: number[] = [];
    await table.updateWithJS((rows) => {
      batchSizes.push(rows.length);
      for (const row of rows) assertEquals(Object.keys(row), ["id"]);
      return rows.splice(0).map((row) => ({ ...row, label: `row-${row.id}` }));
    }, { batchSize: 2500 }).run();
    assertEquals(batchSizes, [2500, 2500, 2]);
    assertEquals(
      await table.getData(),
      Array.from({ length: 5008 }, (_, id) => ({ id, label: `row-${id}` }))
        .filter(({ id }) => id % 1001 !== 0),
    );
    assertEquals(await table.getTypes(), { id: "INTEGER", label: "VARCHAR" });
    assertEquals(await sdb.getTableNames(), ["sparse"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("geometry batches preserve sparse row order, nulls, and a partial final batch", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("polygon batches");
    const polygon = {
      type: "Polygon",
      coordinates: [[[-73, 45], [-72, 45], [-72, 46], [-73, 45]]],
    };
    await table.loadArray(
      Array.from({ length: 9 }, (_, id) => ({
        id,
        "shape column": id === 4 ? null : polygon,
      })),
      { columnTypes: { "shape column": "GEOMETRY('EPSG:4326')" } },
    ).run();
    await sdb.customQuery('DELETE FROM "polygon batches" WHERE id IN (0, 3)');
    const batches: number[][] = [];
    await table.updateWithJS((rows) => {
      batches.push(rows.map((row) => Number(row.id)));
      return rows.splice(0).map((row) => ({
        ...row,
        label: `polygon-${row.id}`,
      }));
    }, { batchSize: 3 }).run();
    assertEquals(batches, [[1, 2, 4], [5, 6, 7], [8]]);
    const actual = await sdb.customQuery(
      `SELECT id, ST_AsGeoJSON("shape column")::VARCHAR AS geometry, label
         FROM "polygon batches"`,
      { returnData: true },
    );
    assertEquals(
      actual!.map((row) => ({
        ...row,
        geometry: row.geometry === null
          ? null
          : JSON.parse(row.geometry as string),
      })),
      [1, 2, 4, 5, 6, 7, 8].map((id) => ({
        id,
        geometry: id === 4 ? null : polygon,
        label: `polygon-${id}`,
      })),
    );
    assertEquals(await sdb.getTableNames(), ["polygon batches"]);
  } finally {
    await sdb.close();
  }
});

Deno.test("should capture batchSize when the update is queued", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("capturedBatchSize");
  table.loadArray(Array.from({ length: 5 }, (_, i) => ({ id: i })));

  const options = { batchSize: 2 };
  const batchSizes: number[] = [];
  table.updateWithJS((rows) => {
    batchSizes.push(rows.length);
    return rows;
  }, options);
  options.batchSize = 1;

  await table.run();
  assertEquals(batchSizes, [2, 2, 1]);
  await sdb.close();
});

Deno.test("should execute queued modifiers in database-wide program order", async () => {
  const sdb = new SimpleDB();
  const first = sdb.newTable("firstModifier");
  const second = sdb.newTable("secondModifier");
  first.loadArray([{ id: 1 }]);
  second.loadArray([{ id: 2 }]);

  const calls: string[] = [];
  first.updateWithJS(async (rows) => {
    await Promise.resolve();
    calls.push("first");
    return rows;
  });
  second.updateWithJS((rows) => {
    calls.push("second");
    return rows;
  });

  await second.getData();
  assertEquals(calls, ["first", "second"]);
  await sdb.close();
});

Deno.test("should work with a batchSize larger than the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("bigBatch");
  table.loadArray([{ id: 1 }, { id: 2 }]);

  let calls = 0;
  table.updateWithJS((rows) => {
    calls++;
    return rows.map((d) => ({ ...d, id: (d.id as number) * 100 }));
  }, { batchSize: 1000 });

  assertEquals(await table.getData(), [{ id: 100 }, { id: 200 }]);
  assertEquals(calls, 1);
  await sdb.close();
});

Deno.test("should not leave temporary tables behind when batching", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("cleanup");
  table.loadArray(Array.from({ length: 5 }, (_, i) => ({ id: i })));

  table.updateWithJS((rows) => rows, { batchSize: 2 });

  const tables = await sdb.getTableNames();
  assertEquals(tables, ["cleanup"]);
  await sdb.close();
});

Deno.test("should throw at call time for an invalid batchSize", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("invalidBatch");
  table.loadArray([{ id: 1 }]);

  assertThrows(
    () => table.updateWithJS((rows) => rows, { batchSize: 0 }),
    Error,
    "updateWithJS() batchSize must be a positive integer.",
  );
  await sdb.close();
});

Deno.test("should handle batches for which the modifier returns no rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("emptyBatches");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  // Rows 4 to 7 fill entire batches, so with batchSize 2 the modifier
  // returns an empty array for two of the batches.
  table.updateWithJS(
    (rows) => rows.filter((d) => (d.id as number) < 4 || (d.id as number) > 7),
    { batchSize: 2 },
  );

  assertEquals(await table.getData(), [
    { id: 0 },
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 8 },
    { id: 9 },
  ]);
  await sdb.close();
});

Deno.test("should throw a clear error when the modifier returns no rows at all", async () => {
  const sdb = new SimpleDB();
  const expectedMessage =
    "The dataModifier returned no rows. updateWithJS can't infer the table schema from zero rows.";

  const plain = sdb.newTable("noRowsPlain");
  plain.loadArray([{ id: 1 }, { id: 2 }]);
  plain.updateWithJS(() => []);
  await assertRejects(() => plain.run(), Error, expectedMessage);

  const batched = sdb.newTable("noRowsBatched");
  batched.loadArray([{ id: 1 }, { id: 2 }]);
  batched.updateWithJS(() => [], { batchSize: 1 });
  await assertRejects(() => batched.run(), Error, expectedMessage);

  // The tables are left unchanged and no temporary tables are left behind.
  assertEquals(await plain.getData(), [{ id: 1 }, { id: 2 }]);
  assertEquals(await batched.getData(), [{ id: 1 }, { id: 2 }]);
  assertEquals(await sdb.getTableNames(), ["noRowsBatched", "noRowsPlain"]);
  await sdb.close();
});

Deno.test("should not leave temporary tables behind when the modifier throws", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("modifierThrows");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  let calls = 0;
  table.updateWithJS((rows) => {
    calls++;
    if (calls === 2) {
      throw new Error("Boom!");
    }
    return rows;
  }, { batchSize: 4 });
  await assertRejects(() => table.run(), Error, "Boom!");
  assertEquals(await sdb.getTableNames(), ["modifierThrows"]);
  assertEquals(await table.getRowCount(), 10);
  await sdb.close();
});

Deno.test("should throw a clear error when the table has a __sda_rowid column and batchSize is used", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("rowidConflict");
  table.loadArray([{ __sda_rowid: 1, value: "a" }]);

  table.updateWithJS((rows) => rows, { batchSize: 1 });
  await assertRejects(
    () => table.run(),
    Error,
    'The table has a column named "__sda_rowid", which conflicts with the internal column used by the batchSize option. Rename it or run updateWithJS without batchSize.',
  );
  await sdb.close();
});

for (
  const column of ["rowid", "ROWID", "RowId", "__sda_rowid", "__SDA_RowId"]
) {
  Deno.test(`updateWithJS rejects batched cursor conflicts before modifying data (${column})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("cursorConflict");
      const data = [
        { [column]: 1, x: "a" },
        { [column]: 1, x: "b" },
        { [column]: 2, x: "c" },
        { [column]: null, x: "d" },
      ];
      table.loadArray(data);
      let calls = 0;
      table.updateWithJS((rows) => {
        calls++;
        return rows;
      }, { batchSize: 1 });

      await assertRejects(
        () => table.run(),
        Error,
        `The table has a column named "${column}", which conflicts with the internal column used by the batchSize option. Rename it or run updateWithJS without batchSize.`,
      );
      assertEquals(calls, 0);
      assertEquals(await table.getData(), data);
      assertEquals(await sdb.getTableNames(), ["cursorConflict"]);

      assertEquals(
        await table.updateWithJS((rows) => {
          calls++;
          return rows;
        }).getData(),
        data,
      );
      assertEquals(calls, 1);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("should be a no-op on an empty table when the modifier returns no rows", async () => {
  const sdb = new SimpleDB();
  const plain = sdb.newTable("emptyPlain");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "emptyPlain" AS SELECT 1 AS id WHERE false`,
  );
  plain.updateWithJS((rows) => rows);
  assertEquals(await plain.getRowCount(), 0);

  const batched = sdb.newTable("emptyBatched");
  await sdb.customQuery(
    `CREATE OR REPLACE TABLE "emptyBatched" AS SELECT 1 AS id WHERE false`,
  );
  batched.updateWithJS((rows) => rows, { batchSize: 2 });
  assertEquals(await batched.getRowCount(), 0);
  await sdb.close();
});

for (const batchSize of [undefined, 1]) {
  Deno.test(`updateWithJS preserves SQL values and types (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    const table = sdb.newTable("preserved");
    try {
      await sdb.customQuery(`CREATE TABLE preserved AS SELECT
        9007199254740993::BIGINT AS id, DATE '2025-01-01' AS date,
        [1, 2]::FLOAT[2] AS vec, 1234567890123456.789::DECIMAL(19,3) AS amount,
        {'ids': [9007199254740993::BIGINT]} AS nested,
        TIMESTAMP '2025-01-01 00:00:00.123456' AS instant`);
      const types = await table.getTypes();
      await sdb.customQuery("CREATE TABLE expected AS SELECT * FROM preserved");
      await table.updateWithJS(
        (rows) => rows.map((row) => ({ ...row, label: "ok" })),
        { batchSize },
      ).run();
      assertEquals(await table.getTypes(), { ...types, label: "VARCHAR" });
      assertEquals(
        await sdb.customQuery(
          "SELECT count(*) AS differences FROM ((SELECT * EXCLUDE(label) FROM preserved) EXCEPT (SELECT * FROM expected))",
          { returnData: true },
        ),
        [{ differences: 0 }],
      );
    } finally {
      await sdb.close();
    }
  });
}

for (const batchSize of [undefined, 1]) {
  Deno.test(`updateWithJS stages invalid writes before replacing data (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    const table = sdb.newTable("atomic");
    try {
      await table.loadArray([{ id: 1 }, { id: 2 }]).run();
      await assertRejects(() =>
        table.updateWithJS(
          (rows) =>
            rows.map((row) => ({
              ...row,
              vector: row.id === 1 ? [1, 2] : [3n, 4n],
            })),
          { batchSize },
        ).run()
      );
      assertEquals(await table.getData(), [{ id: 1 }, { id: 2 }]);
      assertEquals(await sdb.getTableNames(), ["atomic"]);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("updateWithJS exposes editable lossless values and preserves reordered rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("editable");
  try {
    await sdb.customQuery(`CREATE TABLE editable AS SELECT
      9007199254740993::BIGINT + i AS id, [1, 2]::FLOAT[2] AS vec,
      {'ids': [9007199254740993::BIGINT + i]} AS nested,
      DATE '2025-01-01' AS date FROM range(2) t(i)`);
    await table.updateWithJS((rows) =>
      rows.reverse().map((row) => {
        assertEquals(typeof row.id, "bigint");
        (row.vec as number[])[0] = 5;
        (row.nested as { ids: bigint[] }).ids[0] += 1n;
        return { ...row, id: (row.id as bigint) + 1n };
      })
    ).run();
    assertEquals(
      await sdb.customQuery(
        "SELECT CAST(id AS VARCHAR) AS id, vec[1] AS v, CAST(nested.ids[1] AS VARCHAR) AS n FROM editable",
        { returnData: true },
      ),
      [
        { id: "9007199254740995", v: 5, n: "9007199254740995" },
        { id: "9007199254740994", v: 5, n: "9007199254740994" },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("updateWithJS continues batching when the callback consumes the input array", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("consumed");
    await table.loadArray([{ id: 1 }, { id: 2 }, { id: 3 }])
      .updateWithJS((rows) => rows.splice(0), { batchSize: 1 }).run();
    assertEquals(await table.getData(), [{ id: 1 }, { id: 2 }, { id: 3 }]);
  } finally {
    await sdb.close();
  }
});

for (const batchSize of [undefined, 2]) {
  Deno.test(`updateWithJS carries editable geometry with transformed rows (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table.loadArray(
        [1, 2, 3, 4].map((id) => ({
          id,
          geom: { type: "Point", coordinates: [id, 45.123456789012345] },
          empty: null,
        })),
        {
          columnTypes: {
            geom: "GEOMETRY('EPSG:4326')",
            empty: "GEOMETRY('EPSG:4326')",
          },
        },
      ).run();
      const expected: { id: number; x: number; y: number; label: string }[] =
        [];
      await table.updateWithJS(
        (rows) =>
          rows.reverse().filter((row) => row.id !== 3).flatMap((row) => {
            const geom = row.geom as { type: string; coordinates: number[] };
            assertEquals(geom.coordinates[1], 45.123456789012345);
            geom.coordinates[0] += 10;
            const clone = structuredClone(geom);
            clone.coordinates[0] += 20;
            const outputs = [{
              ...row,
              id: row.id,
              geom,
              label: "original",
              added: geom,
            }, {
              ...row,
              id: row.id,
              geom: clone,
              label: "clone",
              added: null,
            }];
            for (const output of outputs) {
              expected.push({
                id: output.id as number,
                x: (output.geom as typeof geom).coordinates[0],
                y: 45.123456789012345,
                label: output.label,
              });
            }
            return outputs;
          }),
        { batchSize, columnTypes: { added: "GEOMETRY('EPSG:4326')" } },
      ).run();
      assertEquals(
        await sdb.customQuery(
          "SELECT id, ST_X(geom) AS x, ST_Y(geom) AS y, label FROM geo",
          { returnData: true },
        ),
        expected,
      );
      assertEquals(
        await sdb.customQuery(
          "SELECT ST_X(added) AS x, empty IS NULL AS empty FROM geo",
          { returnData: true },
        ),
        expected.map((row) => ({
          x: row.label === "original" ? row.x : null,
          empty: true,
        })),
      );
      const types = await table.getTypes();
      for (const key of ["geom", "empty", "added"]) {
        assertEquals(types[key], "GEOMETRY('EPSG:4326')");
      }
      assertEquals(
        await sdb.customQuery("SELECT DISTINCT ST_CRS(geom) AS crs FROM geo", {
          returnData: true,
        }),
        [{ crs: "EPSG:4326" }],
      );
      const originalLog = console.log;
      const lines: string[] = [];
      try {
        console.log = (...args: unknown[]) => {
          lines.push(args.map(String).join(" "));
        };
        await table.log();
      } finally {
        console.log = originalLog;
      }
      assertEquals(lines.join("\n").includes("GEOM(EPSG:4326)"), true);
      assertEquals(lines.join("\n").includes("coordinates"), false);
      assertEquals(await sdb.getTableNames(), ["geo"]);
    } finally {
      await sdb.close();
    }
  });

  for (const failure of ["callback", "geometry", "attribute", "collision"]) {
    Deno.test(`updateWithJS geometry failure is atomic (${batchSize}, ${failure})`, async () => {
      const sdb = new SimpleDB();
      try {
        const table = sdb.newTable("geo");
        await table.loadArray(
          [1, 2, 3, 4].map((id) => ({
            id,
            geom: { type: "Point", coordinates: [id, 45] },
          })),
          { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } },
        ).run();
        const query = "SELECT id, ST_AsText(geom) AS geom FROM geo";
        const before = await sdb.customQuery(query, { returnData: true });
        await assertRejects(() =>
          table.updateWithJS((rows) =>
            rows.map((row) => {
              if (row.id !== 4) {
                return failure === "attribute"
                  ? { ...row, vector: [1, 2] }
                  : row;
              }
              if (failure === "callback") throw new Error("callback failed");
              if (failure === "attribute") return { ...row, vector: [3n, 4n] };
              return {
                ...row,
                geom: failure === "collision"
                  ? "AI text"
                  : { type: "Point", coordinates: [1, 2, 3] },
              };
            }), { batchSize }).run()
        );
        assertEquals(
          await sdb.customQuery(query, { returnData: true }),
          before,
        );
        assertEquals(await sdb.getTableNames(), ["geo"]);
      } finally {
        await sdb.close();
      }
    });
  }

  Deno.test(`updateWithJS preserves geometry binary values and ordinary exact SQL types (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table.loadArray(
        [{ geom: { type: "Point", coordinates: [1, 2] } }],
        { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } },
      ).run();
      await sdb.customQuery(`CREATE OR REPLACE TABLE geo AS SELECT
        ST_GeomFromText(wkt)::GEOMETRY('EPSG:4326') AS geom,
        9007199254740993::BIGINT AS id,
        1234567890123456.789::DECIMAL(19,3) AS amount,
        TIMESTAMP '2025-01-01 00:00:00.123456' AS instant
        FROM (VALUES ('POINT (1.1234567890123457 2.0000000000000004)'),
        ('LINESTRING (1 2, 3 4)'), ('POLYGON ((0 0, 1 0, 1 1, 0 0))'),
        ('MULTIPOINT (1 2, 3 4)'), ('MULTILINESTRING ((1 2, 3 4))'),
        ('MULTIPOLYGON (((0 0, 1 0, 1 1, 0 0)))'),
        ('GEOMETRYCOLLECTION (POINT (1 2), LINESTRING (1 2, 3 4))'),
        ('POLYGON EMPTY'), ('MULTIPOINT EMPTY'), ('GEOMETRYCOLLECTION EMPTY'), (NULL)) t(wkt)`);
      await sdb.customQuery("CREATE TABLE expected AS SELECT * FROM geo");
      const types = await table.getTypes();
      await table.updateWithJS(
        (rows) => rows.map((row) => ({ ...row, label: "ok" })),
        { batchSize },
      ).run();
      assertEquals(await table.getTypes(), { ...types, label: "VARCHAR" });
      assertEquals(
        await sdb.customQuery(
          `SELECT count(*) AS differences FROM (
        (SELECT ST_AsWKB(geom), id, amount, instant FROM geo)
        EXCEPT ALL (SELECT ST_AsWKB(geom), id, amount, instant FROM expected))`,
          { returnData: true },
        ),
        [{ differences: 0 }],
      );
      await table.updateWithJS(
        (rows) => rows.map((row) => ({ ...row, geom: null })),
        { batchSize },
      ).run();
      assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
    } finally {
      await sdb.close();
    }
  });
}

for (const batchSize of [undefined, 1]) {
  Deno.test(`updateWithJS preserves signed zero in existing and new geometry (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("signed_zero");
      await table.loadArray([{ geom: null }], {
        columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
      }).run();
      await sdb.customQuery(`CREATE OR REPLACE TABLE signed_zero AS SELECT
        ST_Point(-0.0::DOUBLE, i::DOUBLE)::GEOMETRY('EPSG:4326') AS geom
        FROM range(2) t(i)`);
      await sdb.customQuery(
        "CREATE TABLE expected AS SELECT * FROM signed_zero",
      );
      await table.updateWithJS((rows) =>
        rows.map((row) => {
          const geom = row.geom as { type: string; coordinates: number[] };
          assertEquals(Object.is(geom.coordinates[0], -0), true);
          return {
            ...row,
            added: { type: "GeometryCollection", geometries: [geom] },
          };
        }), { batchSize, columnTypes: { added: "GEOMETRY('EPSG:4326')" } })
        .run();
      assertEquals(await table.getTypes(), {
        geom: "GEOMETRY('EPSG:4326')",
        added: "GEOMETRY('EPSG:4326')",
      });
      assertEquals(
        await sdb.customQuery(
          `SELECT
          ST_AsWKB(actual.geom) = ST_AsWKB(expected.geom) AS original,
          ST_AsWKB(actual.added) = ST_AsWKB(ST_GeomFromText(
            'GEOMETRYCOLLECTION (POINT (-0.0 ' || ST_Y(expected.geom) || '))')) AS added
          FROM signed_zero actual JOIN expected USING (rowid)`,
          {
            returnData: true,
          },
        ),
        [{ original: true, added: true }, { original: true, added: true }],
      );
    } finally {
      await sdb.close();
    }
  });
}

for (const type of ["GEOMETRY", "GEOMETRY('EPSG:3857')"]) {
  Deno.test(`updateWithJS rejects CRS before callbacks (${type})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table.loadArray([{ geom: null }], {
        columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
      }).run();
      await sdb.customQuery(`CREATE OR REPLACE TABLE geo (geom ${type})`);
      let calls = 0;
      await assertRejects(
        () =>
          table.updateWithJS((rows) => {
            calls++;
            return rows;
          }).run(),
        Error,
        '.reproject("EPSG:4326", { column: "geom" })',
      );
      assertEquals(calls, 0);
    } finally {
      await sdb.close();
    }
  });
}

for (
  const wkt of [
    "POINT Z (1 2 3)",
    "POINT M (1 2 3)",
    "POINT ZM (1 2 3 4)",
    "POINT EMPTY",
    "LINESTRING EMPTY",
  ]
) {
  Deno.test(`updateWithJS rejects unsupported source geometry (${wkt})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table.loadArray([{ geom: null }], {
        columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
      }).run();
      await sdb.customQuery(
        `INSERT INTO geo VALUES (ST_GeomFromText('${wkt}')::GEOMETRY('EPSG:4326'))`,
      );
      let calls = 0;
      await assertRejects(
        () =>
          table.updateWithJS((rows) => {
            calls++;
            return rows;
          }).run(),
        Error,
        "geom",
      );
      assertEquals(calls, 0);
      assertEquals(await table.getRowCount(), 2);
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("updateWithJS requires explicit types for new geometry and validates declarations", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("geo");
    await table.loadArray([{ id: 1 }]).run();
    const declarations: ({ [key: string]: string } | undefined)[] = [
      undefined,
      { geom: "GEOMETRY" },
      {
        missing: "DOUBLE",
      },
      { ID: "DOUBLE" },
    ];
    for (const columnTypes of declarations) {
      await assertRejects(() =>
        table.updateWithJS((rows) =>
          rows.map((row) => ({
            ...row,
            geom: { type: "Point", coordinates: [1, 2] },
          })), { columnTypes }).run()
      );
      assertEquals(await table.getData(), [{ id: 1 }]);
    }
    await table.updateWithJS((rows) =>
      rows.map((row) => ({
        ...row,
        geom: { type: "Point", coordinates: [1, 2] },
      })), { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } }).run();
    assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
  } finally {
    await sdb.close();
  }
});

for (const batchSize of [undefined, 1]) {
  Deno.test(`updateWithJS stores row attributes, discards geometry metadata, and rejects Features (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geometry_metadata");
      await table.loadArray([{
        name: "Station",
        geom: { type: "Point", coordinates: [-73, 45] },
      }], { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } })
        .updateWithJS((rows) =>
          rows.map((row) => ({
            ...row,
            label: "Stored attribute",
            geom: {
              ...(row.geom as Record<string, unknown>),
              properties: { label: "Discarded geometry metadata" },
              id: "discarded-id",
              bbox: [-73, 45, -73, 45],
            },
          })), { batchSize }).run();
      const expected = {
        type: "FeatureCollection",
        features: [{
          type: "Feature",
          geometry: { type: "Point", coordinates: [-73, 45] },
          properties: { name: "Station", label: "Stored attribute" },
        }],
      };
      const exported = await table.getGeoData() as typeof expected;
      assertEquals(exported, expected);
      exported.features[0].properties.label = "Local export edit";
      assertEquals(await table.getGeoData(), expected);
      await assertRejects(
        () =>
          table.updateWithJS((rows) =>
            rows.map((row) => ({
              ...row,
              geom: expected.features[0],
            })), { batchSize }).run(),
        Error,
        "not a Feature or FeatureCollection",
      );
      assertEquals(await table.getGeoData(), expected);
    } finally {
      await sdb.close();
    }
  });
}

for (const batchSize of [undefined, 1]) {
  Deno.test(`updateWithJS supports explicitly typed JSON columns (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("json_updates");
      await table.loadArray([{ id: 1 }, { id: 2 }])
        .updateWithJS((rows) =>
          rows.map((row) => ({
            ...row,
            doc: row.id === 1
              ? null
              : { tags: ["a", "b"], n: 1.0000000000000002 },
            missing: null,
          })), { batchSize, columnTypes: { doc: "JSON", missing: "json" } })
        .run();
      const expected = await table.getData();
      assertEquals(expected, [{ id: 1, doc: null, missing: null }, {
        id: 2,
        doc: '{"tags":["a","b"],"n":1.0000000000000002}',
        missing: null,
      }]);
      assertEquals(await table.getTypes(), {
        id: "DOUBLE",
        doc: "JSON",
        missing: "JSON",
      });
      await table.updateWithJS((rows) => rows, { batchSize }).run();
      assertEquals(await table.getData(), expected);
      assertEquals(await table.getTypes(), {
        id: "DOUBLE",
        doc: "JSON",
        missing: "JSON",
      });
      await assertRejects(
        () =>
          table.updateWithJS((rows) =>
            rows.map((row) => ({
              ...row,
              invalid: row.id === 1 ? { ok: true } : { invalid: undefined },
            })), { batchSize, columnTypes: { invalid: "JSON" } }).run(),
        Error,
        'Column "invalid"',
      );
      assertEquals(await table.getData(), expected);
      assertEquals(await sdb.getTableNames(), ["json_updates"]);
    } finally {
      await sdb.close();
    }
  });
}
