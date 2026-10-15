import parseJson from "../../helpers/parseJson.ts";
import { test, expect } from "vite-plus/test";
import { assertRejects, assertThrows } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";

for (const batchSize of [undefined, 1000]) {
  for (const { type, initial, invalid, message } of [
    {
      type: "INTEGER",
      initial: "2147483647",
      invalid: 2147483648,
      message: "int32 range",
    },
    {
      type: "INTEGER",
      initial: "-2147483648",
      invalid: 1.5,
      message: "not an integer",
    },
    {
      type: "UINTEGER",
      initial: "4294967295",
      invalid: -1,
      message: "uint32 range",
    },
    {
      type: "BIGINT",
      initial: "9223372036854775807",
      invalid: 9223372036854775808n,
      message: "int64 range",
    },
    {
      type: "ENUM('ok', '__proto__')",
      initial: "'__proto__'",
      invalid: "unknown",
      message: "not a member",
    },
  ]) {
    test(`updateWithJS rejects ${String(invalid)} for ${type} without replacing data (${batchSize})`, async () => {
      const sdb = new SimpleDB();
      try {
        const table = sdb.newTable("validated_updates");
        await sdb.customQuery(`CREATE TABLE validated_updates AS
          SELECT i::INTEGER AS id, (${initial})::${type} AS value
          FROM range(2001) t(i)`);
        const query = "SELECT id, value::VARCHAR AS value FROM validated_updates ORDER BY id";
        const before = await sdb.customQuery(query, { returnData: true });
        const types = await table.getTypes();
        await assertRejects(
          () =>
            table
              .updateWithJS(
                (rows) =>
                  rows.map((row) => ({
                    ...row,
                    value: row.id === 2000 ? invalid : row.value,
                  })),
                { batchSize },
              )
              .run(),
          Error,
          message,
        );
        expect(await sdb.customQuery(query, { returnData: true })).toStrictEqual(before);
        expect(await table.getTypes()).toStrictEqual(types);
        expect(await sdb.getTableNames()).toStrictEqual(["validated_updates"]);
        await table.updateWithJS((rows) => rows, { batchSize }).run();
        expect(await sdb.customQuery(query, { returnData: true })).toStrictEqual(before);
      } finally {
        await sdb.close();
      }
    });
  }
}

test("should update the data from the table with a javascript function and reinsert it into the table", async () => {
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

  expect(data).toStrictEqual([
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

test("should update the data from the table with an async javascript function and reinsert it into the table", async () => {
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

  expect(data).toStrictEqual([
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
test("should produce the same result with and without batchSize", async () => {
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

  expect(await batched.getData()).toStrictEqual(await plain.getData());
  await sdb.close();
});

test("should call the modifier once per batch", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("batchCalls");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  const batchSizes: number[] = [];
  table.updateWithJS(
    (rows) => {
      batchSizes.push(rows.length);
      return rows;
    },
    { batchSize: 4 },
  );

  expect(await table.getRowCount()).toStrictEqual(10);
  expect(batchSizes).toStrictEqual([4, 4, 2]);
  await sdb.close();
});

test("batched updates preserve sparse cursors, partial batches, and consumed input", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("sparse");
    await sdb.customQuery("CREATE TABLE sparse AS SELECT i::INTEGER AS id FROM range(5008) t(i)");
    await sdb.customQuery("DELETE FROM sparse WHERE id % 1001 = 0");
    const batchSizes: number[] = [];
    await table
      .updateWithJS(
        (rows) => {
          batchSizes.push(rows.length);
          for (const row of rows) expect(Object.keys(row)).toStrictEqual(["id"]);
          return rows.splice(0).map((row) => ({ ...row, label: `row-${Number(row.id)}` }));
        },
        { batchSize: 2500 },
      )
      .run();
    expect(batchSizes).toStrictEqual([2500, 2500, 2]);
    expect(await table.getData()).toStrictEqual(
      Array.from({ length: 5008 }, (_, id) => ({ id, label: `row-${id}` })).filter(
        ({ id }) => id % 1001 !== 0,
      ),
    );
    expect(await table.getTypes()).toStrictEqual({ id: "INTEGER", label: "VARCHAR" });
    expect(await sdb.getTableNames()).toStrictEqual(["sparse"]);
  } finally {
    await sdb.close();
  }
});

test("geometry batches preserve sparse row order, nulls, and a partial final batch", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("polygon batches");
    const polygon = {
      type: "Polygon",
      coordinates: [
        [
          [-73, 45],
          [-72, 45],
          [-72, 46],
          [-73, 45],
        ],
      ],
    };
    await table
      .loadArray(
        Array.from({ length: 9 }, (_, id) => ({
          id,
          "shape column": id === 4 ? null : polygon,
        })),
        { columnTypes: { "shape column": "GEOMETRY('EPSG:4326')" } },
      )
      .run();
    await sdb.customQuery('DELETE FROM "polygon batches" WHERE id IN (0, 3)');
    const batches: number[][] = [];
    await table
      .updateWithJS(
        (rows) => {
          batches.push(rows.map((row) => Number(row.id)));
          return rows.splice(0).map((row) => ({
            ...row,
            label: `polygon-${Number(row.id)}`,
          }));
        },
        { batchSize: 3 },
      )
      .run();
    expect(batches).toStrictEqual([[1, 2, 4], [5, 6, 7], [8]]);
    const actual = await sdb.customQuery(
      `SELECT id, ST_AsGeoJSON("shape column")::VARCHAR AS geometry, label
         FROM "polygon batches"`,
      { returnData: true },
    );
    expect(
      actual!.map((row) => ({
        ...row,
        geometry: row.geometry === null ? null : parseJson(row.geometry as string),
      })),
    ).toStrictEqual(
      [1, 2, 4, 5, 6, 7, 8].map((id) => ({
        id,
        geometry: id === 4 ? null : polygon,
        label: `polygon-${id}`,
      })),
    );
    expect(await sdb.getTableNames()).toStrictEqual(["polygon batches"]);
  } finally {
    await sdb.close();
  }
});

test("should capture batchSize when the update is queued", async () => {
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
  expect(batchSizes).toStrictEqual([2, 2, 1]);
  await sdb.close();
});

test("should execute queued modifiers in database-wide program order", async () => {
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
  expect(calls).toStrictEqual(["first", "second"]);
  await sdb.close();
});

test("should work with a batchSize larger than the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("bigBatch");
  table.loadArray([{ id: 1 }, { id: 2 }]);

  let calls = 0;
  table.updateWithJS(
    (rows) => {
      calls++;
      return rows.map((d) => ({ ...d, id: (d.id as number) * 100 }));
    },
    { batchSize: 1000 },
  );

  expect(await table.getData()).toStrictEqual([{ id: 100 }, { id: 200 }]);
  expect(calls).toStrictEqual(1);
  await sdb.close();
});

test("should not leave temporary tables behind when batching", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("cleanup");
  table.loadArray(Array.from({ length: 5 }, (_, i) => ({ id: i })));

  table.updateWithJS((rows) => rows, { batchSize: 2 });

  const tables = await sdb.getTableNames();
  expect(tables).toStrictEqual(["cleanup"]);
  await sdb.close();
});

test("should throw at call time for an invalid batchSize", async () => {
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

test("should handle batches for which the modifier returns no rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("emptyBatches");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  // Rows 4 to 7 fill entire batches, so with batchSize 2 the modifier
  // returns an empty array for two of the batches.
  table.updateWithJS((rows) => rows.filter((d) => (d.id as number) < 4 || (d.id as number) > 7), {
    batchSize: 2,
  });

  expect(await table.getData()).toStrictEqual([
    { id: 0 },
    { id: 1 },
    { id: 2 },
    { id: 3 },
    { id: 8 },
    { id: 9 },
  ]);
  await sdb.close();
});

test("should throw a clear error when the modifier returns no rows at all", async () => {
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
  expect(await plain.getData()).toStrictEqual([{ id: 1 }, { id: 2 }]);
  expect(await batched.getData()).toStrictEqual([{ id: 1 }, { id: 2 }]);
  expect(await sdb.getTableNames()).toStrictEqual(["noRowsBatched", "noRowsPlain"]);
  await sdb.close();
});

test("should not leave temporary tables behind when the modifier throws", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("modifierThrows");
  table.loadArray(Array.from({ length: 10 }, (_, i) => ({ id: i })));

  let calls = 0;
  table.updateWithJS(
    (rows) => {
      calls++;
      if (calls === 2) {
        throw new Error("Boom!");
      }
      return rows;
    },
    { batchSize: 4 },
  );
  await assertRejects(() => table.run(), Error, "Boom!");
  expect(await sdb.getTableNames()).toStrictEqual(["modifierThrows"]);
  expect(await table.getRowCount()).toStrictEqual(10);
  await sdb.close();
});

test("should throw a clear error when the table has a __sda_rowid column and batchSize is used", async () => {
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

for (const column of ["rowid", "ROWID", "RowId", "__sda_rowid", "__SDA_RowId"]) {
  test(`updateWithJS rejects batched cursor conflicts before modifying data (${column})`, async () => {
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
      table.updateWithJS(
        (rows) => {
          calls++;
          return rows;
        },
        { batchSize: 1 },
      );

      await assertRejects(
        () => table.run(),
        Error,
        `The table has a column named "${column}", which conflicts with the internal column used by the batchSize option. Rename it or run updateWithJS without batchSize.`,
      );
      expect(calls).toStrictEqual(0);
      expect(await table.getData()).toStrictEqual(data);
      expect(await sdb.getTableNames()).toStrictEqual(["cursorConflict"]);

      expect(
        await table
          .updateWithJS((rows) => {
            calls++;
            return rows;
          })
          .getData(),
      ).toStrictEqual(data);
      expect(calls).toStrictEqual(1);
    } finally {
      await sdb.close();
    }
  });
}

test("should be a no-op on an empty table when the modifier returns no rows", async () => {
  const sdb = new SimpleDB();
  const plain = sdb.newTable("emptyPlain");
  await sdb.customQuery(`CREATE OR REPLACE TABLE "emptyPlain" AS SELECT 1 AS id WHERE false`);
  plain.updateWithJS((rows) => rows);
  expect(await plain.getRowCount()).toStrictEqual(0);

  const batched = sdb.newTable("emptyBatched");
  await sdb.customQuery(`CREATE OR REPLACE TABLE "emptyBatched" AS SELECT 1 AS id WHERE false`);
  batched.updateWithJS((rows) => rows, { batchSize: 2 });
  expect(await batched.getRowCount()).toStrictEqual(0);
  await sdb.close();
});

for (const batchSize of [undefined, 1]) {
  test(`updateWithJS preserves SQL values and types (${batchSize})`, async () => {
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
      await table
        .updateWithJS((rows) => rows.map((row) => ({ ...row, label: "ok" })), { batchSize })
        .run();
      expect(await table.getTypes()).toStrictEqual({ ...types, label: "VARCHAR" });
      expect(
        await sdb.customQuery(
          "SELECT count(*) AS differences FROM ((SELECT * EXCLUDE(label) FROM preserved) EXCEPT (SELECT * FROM expected))",
          { returnData: true },
        ),
      ).toStrictEqual([{ differences: 0 }]);
    } finally {
      await sdb.close();
    }
  });
}

for (const batchSize of [undefined, 1]) {
  test(`updateWithJS stages invalid writes before replacing data (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    const table = sdb.newTable("atomic");
    try {
      await table.loadArray([{ id: 1 }, { id: 2 }]).run();
      await assertRejects(() =>
        table
          .updateWithJS(
            (rows) =>
              rows.map((row) => ({
                ...row,
                vector: row.id === 1 ? [1, 2] : [3n, 4n],
              })),
            { batchSize },
          )
          .run(),
      );
      expect(await table.getData()).toStrictEqual([{ id: 1 }, { id: 2 }]);
      expect(await sdb.getTableNames()).toStrictEqual(["atomic"]);
    } finally {
      await sdb.close();
    }
  });
}

test("updateWithJS exposes editable lossless values and preserves reordered rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("editable");
  try {
    await sdb.customQuery(`CREATE TABLE editable AS SELECT
      9007199254740993::BIGINT + i AS id, [1, 2]::FLOAT[2] AS vec,
      {'ids': [9007199254740993::BIGINT + i]} AS nested,
      DATE '2025-01-01' AS date FROM range(2) t(i)`);
    await table
      .updateWithJS((rows) =>
        rows.reverse().map((row) => {
          expect(typeof row.id).toStrictEqual("bigint");
          (row.vec as number[])[0] = 5;
          (row.nested as { ids: bigint[] }).ids[0] += 1n;
          return { ...row, id: (row.id as bigint) + 1n };
        }),
      )
      .run();
    expect(
      await sdb.customQuery(
        "SELECT CAST(id AS VARCHAR) AS id, vec[1] AS v, CAST(nested.ids[1] AS VARCHAR) AS n FROM editable",
        { returnData: true },
      ),
    ).toStrictEqual([
      { id: "9007199254740995", v: 5, n: "9007199254740995" },
      { id: "9007199254740994", v: 5, n: "9007199254740994" },
    ]);
  } finally {
    await sdb.close();
  }
});

test("updateWithJS continues batching when the callback consumes the input array", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("consumed");
    await table
      .loadArray([{ id: 1 }, { id: 2 }, { id: 3 }])
      .updateWithJS((rows) => rows.splice(0), { batchSize: 1 })
      .run();
    expect(await table.getData()).toStrictEqual([{ id: 1 }, { id: 2 }, { id: 3 }]);
  } finally {
    await sdb.close();
  }
});

for (const batchSize of [undefined, 2]) {
  test(`updateWithJS carries editable geometry with transformed rows (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table
        .loadArray(
          [1, 2, 3, 4].map((id) => ({
            id,
            geom: { type: "Point", coordinates: [id, Number("45.123456789012345")] },
            empty: null,
          })),
          {
            columnTypes: {
              geom: "GEOMETRY('EPSG:4326')",
              empty: "GEOMETRY('EPSG:4326')",
            },
          },
        )
        .run();
      const expected: { id: number; x: number; y: number; label: string }[] = [];
      await table
        .updateWithJS(
          (rows) =>
            rows
              .reverse()
              .filter((row) => row.id !== 3)
              .flatMap((row) => {
                const geom = row.geom as { type: string; coordinates: number[] };
                expect(geom.coordinates[1]).toStrictEqual(Number("45.123456789012345"));
                geom.coordinates[0] += 10;
                const clone = structuredClone(geom);
                clone.coordinates[0] += 20;
                const outputs = [
                  {
                    ...row,
                    id: row.id,
                    geom,
                    label: "original",
                    added: geom,
                  },
                  {
                    ...row,
                    id: row.id,
                    geom: clone,
                    label: "clone",
                    added: null,
                  },
                ];
                for (const output of outputs) {
                  expected.push({
                    id: output.id as number,
                    x: (output.geom as typeof geom).coordinates[0],
                    y: Number("45.123456789012345"),
                    label: output.label,
                  });
                }
                return outputs;
              }),
          { batchSize, columnTypes: { added: "GEOMETRY('EPSG:4326')" } },
        )
        .run();
      expect(
        await sdb.customQuery("SELECT id, ST_X(geom) AS x, ST_Y(geom) AS y, label FROM geo", {
          returnData: true,
        }),
      ).toStrictEqual(expected);
      expect(
        await sdb.customQuery("SELECT ST_X(added) AS x, empty IS NULL AS empty FROM geo", {
          returnData: true,
        }),
      ).toStrictEqual(
        expected.map((row) => ({
          x: row.label === "original" ? row.x : null,
          empty: true,
        })),
      );
      const types = await table.getTypes();
      for (const key of ["geom", "empty", "added"]) {
        expect(types[key]).toStrictEqual("GEOMETRY('EPSG:4326')");
      }
      expect(
        await sdb.customQuery("SELECT DISTINCT ST_CRS(geom) AS crs FROM geo", {
          returnData: true,
        }),
      ).toStrictEqual([{ crs: "EPSG:4326" }]);
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
      expect(lines.join("\n").includes("GEOM(EPSG:4326)")).toStrictEqual(true);
      expect(lines.join("\n").includes("coordinates")).toStrictEqual(false);
      expect(await sdb.getTableNames()).toStrictEqual(["geo"]);
    } finally {
      await sdb.close();
    }
  });

  for (const failure of ["callback", "geometry", "attribute", "collision"]) {
    test(`updateWithJS geometry failure is atomic (${batchSize}, ${failure})`, async () => {
      const sdb = new SimpleDB();
      try {
        const table = sdb.newTable("geo");
        await table
          .loadArray(
            [1, 2, 3, 4].map((id) => ({
              id,
              geom: { type: "Point", coordinates: [id, 45] },
            })),
            { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } },
          )
          .run();
        const query = "SELECT id, ST_AsText(geom) AS geom FROM geo";
        const before = await sdb.customQuery(query, { returnData: true });
        await assertRejects(() =>
          table
            .updateWithJS(
              (rows) =>
                rows.map((row) => {
                  if (row.id !== 4) {
                    return failure === "attribute" ? { ...row, vector: [1, 2] } : row;
                  }
                  if (failure === "callback") throw new Error("callback failed");
                  if (failure === "attribute") return { ...row, vector: [3n, 4n] };
                  return {
                    ...row,
                    geom:
                      failure === "collision"
                        ? "AI text"
                        : { type: "Point", coordinates: [1, 2, 3] },
                  };
                }),
              { batchSize },
            )
            .run(),
        );
        expect(await sdb.customQuery(query, { returnData: true })).toStrictEqual(before);
        expect(await sdb.getTableNames()).toStrictEqual(["geo"]);
      } finally {
        await sdb.close();
      }
    });
  }

  test(`updateWithJS preserves geometry binary values and ordinary exact SQL types (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table
        .loadArray([{ geom: { type: "Point", coordinates: [1, 2] } }], {
          columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
        })
        .run();
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
      await table
        .updateWithJS((rows) => rows.map((row) => ({ ...row, label: "ok" })), { batchSize })
        .run();
      expect(await table.getTypes()).toStrictEqual({ ...types, label: "VARCHAR" });
      expect(
        await sdb.customQuery(
          `SELECT count(*) AS differences FROM (
        (SELECT ST_AsWKB(geom), id, amount, instant FROM geo)
        EXCEPT ALL (SELECT ST_AsWKB(geom), id, amount, instant FROM expected))`,
          { returnData: true },
        ),
      ).toStrictEqual([{ differences: 0 }]);
      await table
        .updateWithJS((rows) => rows.map((row) => ({ ...row, geom: null })), { batchSize })
        .run();
      expect((await table.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
    } finally {
      await sdb.close();
    }
  });
}

for (const batchSize of [undefined, 1]) {
  test(`updateWithJS preserves signed zero in existing and new geometry (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("signed_zero");
      await table
        .loadArray([{ geom: null }], {
          columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
        })
        .run();
      await sdb.customQuery(`CREATE OR REPLACE TABLE signed_zero AS SELECT
        ST_Point(-0.0::DOUBLE, i::DOUBLE)::GEOMETRY('EPSG:4326') AS geom
        FROM range(2) t(i)`);
      await sdb.customQuery("CREATE TABLE expected AS SELECT * FROM signed_zero");
      await table
        .updateWithJS(
          (rows) =>
            rows.map((row) => {
              const geom = row.geom as { type: string; coordinates: number[] };
              expect(Object.is(geom.coordinates[0], -0)).toStrictEqual(true);
              return {
                ...row,
                added: { type: "GeometryCollection", geometries: [geom] },
              };
            }),
          { batchSize, columnTypes: { added: "GEOMETRY('EPSG:4326')" } },
        )
        .run();
      expect(await table.getTypes()).toStrictEqual({
        geom: "GEOMETRY('EPSG:4326')",
        added: "GEOMETRY('EPSG:4326')",
      });
      expect(
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
      ).toStrictEqual([
        { original: true, added: true },
        { original: true, added: true },
      ]);
    } finally {
      await sdb.close();
    }
  });
}

for (const type of ["GEOMETRY", "GEOMETRY('EPSG:3857')"]) {
  test(`updateWithJS rejects CRS before callbacks (${type})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table
        .loadArray([{ geom: null }], {
          columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
        })
        .run();
      await sdb.customQuery(`CREATE OR REPLACE TABLE geo (geom ${type})`);
      let calls = 0;
      await assertRejects(
        () =>
          table
            .updateWithJS((rows) => {
              calls++;
              return rows;
            })
            .run(),
        Error,
        '.reproject("EPSG:4326", { column: "geom" })',
      );
      expect(calls).toStrictEqual(0);
    } finally {
      await sdb.close();
    }
  });
}

for (const wkt of [
  "POINT Z (1 2 3)",
  "POINT M (1 2 3)",
  "POINT ZM (1 2 3 4)",
  "POINT EMPTY",
  "LINESTRING EMPTY",
]) {
  test(`updateWithJS rejects unsupported source geometry (${wkt})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geo");
      await table
        .loadArray([{ geom: null }], {
          columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
        })
        .run();
      await sdb.customQuery(
        `INSERT INTO geo VALUES (ST_GeomFromText('${wkt}')::GEOMETRY('EPSG:4326'))`,
      );
      let calls = 0;
      await assertRejects(
        () =>
          table
            .updateWithJS((rows) => {
              calls++;
              return rows;
            })
            .run(),
        Error,
        "geom",
      );
      expect(calls).toStrictEqual(0);
      expect(await table.getRowCount()).toStrictEqual(2);
    } finally {
      await sdb.close();
    }
  });
}

test("updateWithJS requires explicit types for new geometry and validates declarations", async () => {
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
        table
          .updateWithJS(
            (rows) =>
              rows.map((row) => ({
                ...row,
                geom: { type: "Point", coordinates: [1, 2] },
              })),
            { columnTypes },
          )
          .run(),
      );
      expect(await table.getData()).toStrictEqual([{ id: 1 }]);
    }
    await table
      .updateWithJS(
        (rows) =>
          rows.map((row) => ({
            ...row,
            geom: { type: "Point", coordinates: [1, 2] },
          })),
        { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } },
      )
      .run();
    expect((await table.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
  } finally {
    await sdb.close();
  }
});

for (const batchSize of [undefined, 1]) {
  test(`updateWithJS stores row attributes, discards geometry metadata, and rejects Features (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("geometry_metadata");
      await table
        .loadArray(
          [
            {
              name: "Station",
              geom: { type: "Point", coordinates: [-73, 45] },
            },
          ],
          { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } },
        )
        .updateWithJS(
          (rows) =>
            rows.map((row) => ({
              ...row,
              label: "Stored attribute",
              geom: {
                ...(row.geom as Record<string, unknown>),
                properties: { label: "Discarded geometry metadata" },
                id: "discarded-id",
                bbox: [-73, 45, -73, 45],
              },
            })),
          { batchSize },
        )
        .run();
      const expected = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: { type: "Point", coordinates: [-73, 45] },
            properties: { name: "Station", label: "Stored attribute" },
          },
        ],
      };
      const exported = (await table.getGeoData()) as typeof expected;
      expect(exported).toStrictEqual(expected);
      exported.features[0].properties.label = "Local export edit";
      expect(await table.getGeoData()).toStrictEqual(expected);
      await assertRejects(
        () =>
          table
            .updateWithJS(
              (rows) =>
                rows.map((row) => ({
                  ...row,
                  geom: expected.features[0],
                })),
              { batchSize },
            )
            .run(),
        Error,
        "not a Feature or FeatureCollection",
      );
      expect(await table.getGeoData()).toStrictEqual(expected);
    } finally {
      await sdb.close();
    }
  });
}

for (const batchSize of [undefined, 1]) {
  test(`updateWithJS supports explicitly typed JSON columns (${batchSize})`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("json_updates");
      await table
        .loadArray([{ id: 1 }, { id: 2 }])
        .updateWithJS(
          (rows) =>
            rows.map((row) => ({
              ...row,
              doc: row.id === 1 ? null : { tags: ["a", "b"], n: 1.0000000000000002 },
              missing: null,
            })),
          { batchSize, columnTypes: { doc: "JSON", missing: "json" } },
        )
        .run();
      const expected = await table.getData();
      expect(expected).toStrictEqual([
        { id: 1, doc: null, missing: null },
        {
          id: 2,
          doc: '{"tags":["a","b"],"n":1.0000000000000002}',
          missing: null,
        },
      ]);
      expect(await table.getTypes()).toStrictEqual({
        id: "DOUBLE",
        doc: "JSON",
        missing: "JSON",
      });
      await table.updateWithJS((rows) => rows, { batchSize }).run();
      expect(await table.getData()).toStrictEqual(expected);
      expect(await table.getTypes()).toStrictEqual({
        id: "DOUBLE",
        doc: "JSON",
        missing: "JSON",
      });
      await assertRejects(
        () =>
          table
            .updateWithJS(
              (rows) =>
                rows.map((row) => ({
                  ...row,
                  invalid: row.id === 1 ? { ok: true } : { invalid: undefined },
                })),
              { batchSize, columnTypes: { invalid: "JSON" } },
            )
            .run(),
        Error,
        'Column "invalid"',
      );
      expect(await table.getData()).toStrictEqual(expected);
      expect(await sdb.getTableNames()).toStrictEqual(["json_updates"]);
    } finally {
      await sdb.close();
    }
  });
}

test("batched updates align changing column order and retain SQL casts for inferred types", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("changing batches");
    await table
      .loadArray([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }])
      .updateWithJS(
        (rows) =>
          rows.map(({ id }) =>
            id === 1
              ? { id, added: null }
              : id === 2
                ? { added: 20, id }
                : id === 3
                  ? { id }
                  : { id, added: "forty" },
          ),
        { batchSize: 1 },
      )
      .run();
    expect(await table.getData()).toStrictEqual([
      { id: 1, added: null },
      { id: 2, added: "20.0" },
      { id: 3, added: null },
      { id: 4, added: "forty" },
    ]);
    expect(await sdb.getTableNames()).toStrictEqual(["changing batches"]);
  } finally {
    await sdb.close();
  }
});

test("updateWithJS replaces indexed tables and keeps compatible views usable", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable('quoted".table');
    await sdb.customQuery(
      `CREATE TABLE "quoted"".table" (id INTEGER PRIMARY KEY, value INTEGER);
      INSERT INTO "quoted"".table" VALUES (1, 10), (2, 20);
      CREATE INDEX value_index ON "quoted"".table" (value);
      CREATE VIEW updated_view AS SELECT * FROM "quoted"".table"`,
    );
    await table
      .updateWithJS(
        (rows) =>
          rows.map((row) => ({
            ...row,
            value: Number(row.value) * 2,
          })),
        { batchSize: 1 },
      )
      .run();
    expect(
      await sdb.customQuery("SELECT * FROM updated_view ORDER BY id", {
        returnData: true,
      }),
    ).toStrictEqual([
      { id: 1, value: 20 },
      { id: 2, value: 40 },
    ]);
    // Replacement, like CTAS, does not carry destination constraints or indexes.
    await sdb.customQuery('INSERT INTO "quoted"".table" VALUES (1, 60)');
    expect(
      await sdb.customQuery("SELECT count(*) AS n FROM duckdb_indexes()", {
        returnData: true,
      }),
    ).toStrictEqual([{ n: 0 }]);
  } finally {
    await sdb.close();
  }
});

for (const shadow of ["temporary", "search path"]) {
  test(`updateWithJS publishes in the creation schema with a ${shadow} source`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable("shadowed");
      if (shadow === "temporary") {
        await sdb.customQuery(`CREATE TABLE shadowed AS SELECT 0 AS value;
          CREATE TEMP TABLE shadowed AS SELECT 10 AS value`);
      } else {
        await sdb.customQuery(`CREATE SCHEMA source;
          CREATE TABLE source.shadowed AS SELECT 10 AS value;
          SET search_path = 'main,source'`);
      }
      await table
        .updateWithJS((rows) =>
          rows.map((row) => ({
            value: Number(row.value) + 1,
          })),
        )
        .run();
      const catalog = (
        await sdb.connection!.runAndReadAll("SELECT current_database()")
      ).getRows()[0][0];
      expect(
        await sdb.customQuery(
          `SELECT * FROM "${JSON.stringify(catalog).slice(1, -1)}".main.shadowed`,
          {
            returnData: true,
          },
        ),
      ).toStrictEqual([{ value: 11 }]);
      expect(
        await sdb.customQuery(
          `SELECT * FROM ${shadow === "temporary" ? "temp.main" : "source"}.shadowed`,
          { returnData: true },
        ),
      ).toStrictEqual([{ value: 10 }]);
    } finally {
      await sdb.close();
    }
  });
}
