import {
  executePreparedArray,
  prepareArray,
} from "../../../src/methods/loadArray.ts";
import { assertEquals, assertRejects, assertThrows } from "@std/assert";
import { DuckDBTimeValue } from "@duckdb/node-api";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("should load an array of objects into a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      key1: 1,
      key2: "un",
      key3: new Date("2010-01-01"),
      key4: true,
    },
    {
      key1: NaN,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    {
      key1: 3,
      key2: undefined,
      key3: new Date("2010-01-03"),
      key4: false,
    },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    { key1: 1, key2: "un", key3: new Date("2010-01-01"), key4: true },
    {
      key1: null,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    { key1: 3, key2: null, key3: new Date("2010-01-03"), key4: false },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  await sdb.close();
});

Deno.test("should load an array of objects into a table and return the table", async () => {
  const sdb = new SimpleDB();
  const table = await sdb.newTable().loadArray([
    {
      key1: 1,
      key2: "un",
      key3: new Date("2010-01-01"),
      key4: true,
    },
    {
      key1: NaN,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    {
      key1: 3,
      key2: undefined,
      key3: new Date("2010-01-03"),
      key4: false,
    },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  assertEquals(table instanceof SimpleTable, true);
  await table.run();
  await sdb.close();
});

Deno.test("should load an array of objects into a table with spaces in column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": "un",
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": "un",
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  await sdb.close();
});
Deno.test("should load an array of objects even if the first rows have null values", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  await sdb.close();
});
Deno.test("should load an array of objects even if the all values in a column are null", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": null,
    },
    {
      "column 1": 3,
      "column 2": null,
    },
    {
      "column 1": 4,
      "column 2": null,
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": null,
    },
    {
      "column 1": 3,
      "column 2": null,
    },
    {
      "column 1": 4,
      "column 2": null,
    },
  ]);

  const types = await table.getTypes();

  assertEquals(types, {
    "column 1": "DOUBLE",
    "column 2": "VARCHAR",
  });

  await sdb.close();
});

Deno.test("should throw a clear error for an empty array", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("emptyArray");

  let error: unknown;
  try {
    table.loadArray([]);
  } catch (e) {
    error = e;
  }
  assertEquals(
    (error as Error).message,
    "The array is empty. loadArray needs at least one object to infer the column types.",
  );
  await sdb.close();
});

Deno.test("loadArray captures row, Date, and array values when queued", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("capturedArray");
  const date = new Date("2020-01-02T03:04:05.000Z");
  const vector = [1, 2];
  const row = { name: "before", date, vector };
  const rows = [
    row,
    { name: "empty", date: null, vector: null },
  ];

  table.loadArray(rows);
  row.name = "after";
  date.setUTCFullYear(2030);
  vector[0] = 99;
  rows.push({
    name: "later",
    date: new Date("2040-01-01T00:00:00.000Z"),
    vector: [8, 9],
  });

  const result = await sdb.customQuery(
    `SELECT name, date, vector[1] AS first FROM "capturedArray"`,
    { returnData: true },
  );
  assertEquals(result, [
    {
      name: "before",
      date: new Date("2020-01-02T03:04:05.000Z"),
      first: 1,
    },
    { name: "empty", date: null, first: null },
  ]);

  await sdb.close();
});

Deno.test("library SQL supports double quotes in table and column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable('people "archive"');

  const result = await table
    .loadArray([{ 'full "name"': "Ada" }])
    .sort({ 'full "name"': "asc" })
    .getData({ columns: 'full "name"' });

  assertEquals(result, [{ 'full "name"': "Ada" }]);
  await sdb.close();
});

Deno.test("loadArray snapshots partial column type overrides", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    const options: {
      columnTypes: { value: "number" | "BOOLEAN" | "INTEGER" };
    } = { columnTypes: { value: "number" } };
    table.loadArray([{ name: "A", value: null }, {
      name: "B",
      value: undefined,
    }], options);
    options.columnTypes.value = "BOOLEAN";
    options.columnTypes = { value: "INTEGER" };
    assertEquals(await table.getTypes(), { name: "VARCHAR", value: "DOUBLE" });
    assertEquals(await table.getData(), [{ name: "A", value: null }, {
      name: "B",
      value: null,
    }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray supports explicit SQL types and JavaScript aliases", async () => {
  const sdb = new SimpleDB();
  try {
    for (
      const [type, value, expected] of [
        ["integer", 42, "INTEGER"],
        ["BIGINT", 42n, "BIGINT"],
        ["number", 1.5, "DOUBLE"],
        ["float", 1.5, "DOUBLE"],
        ["DOUBLE", 1.5, "DOUBLE"],
        ["string", "hello", "VARCHAR"],
        ["VARCHAR", "hello", "VARCHAR"],
        ["boolean", true, "BOOLEAN"],
        ["date", new Date("2020-01-01"), "DATE"],
        ["datetime", new Date("2020-01-01T12:34:56Z"), "TIMESTAMP"],
        ["TIMESTAMP", new Date("2020-01-01"), "TIMESTAMP"],
        ["datetimeTz", new Date("2020-01-01"), "TIMESTAMP WITH TIME ZONE"],
        [
          "timestamp with time zone",
          new Date("2020-01-01"),
          "TIMESTAMP WITH TIME ZONE",
        ],
        ["TIME", new DuckDBTimeValue(123456n), "TIME"],
        ["FLOAT[2]", [1.5, 2], "FLOAT[2]"],
      ] as const
    ) {
      const table = sdb.newTable().loadArray([{ value }], {
        columnTypes: { value: type },
      });
      assertEquals(await table.getTypes(), { value: expected });
      await table.getData();
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray rejects invalid overrides before replacing existing data", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([{ value: 7 }]);
    await table.run();
    assertThrows(
      () =>
        table.loadArray([{ value: null }], {
          columnTypes: { missing: "DOUBLE" },
        }),
      Error,
      'Unknown column "missing"',
    );
    for (
      const type of [
        "invalid",
        "DOUBLE); DROP TABLE x; --",
        "FLOAT[2] trailing",
        "GEOMETRY",
      ]
    ) {
      assertThrows(
        () =>
          // @ts-expect-error Unsupported type names are also rejected at compile time.
          table.loadArray([{ value: null }], { columnTypes: { value: type } }),
        Error,
        "Unsupported type",
      );
    }
    for (
      const [type, value, loss] of [
        ["INTEGER", 1.5, true],
        ["INTEGER", 2147483648, true],
        ["INTEGER", -2147483649, true],
        ["BIGINT", 9223372036854775808n, true],
        ["BIGINT", 2 ** 63, true],
        ["BIGINT", -(2 ** 63) - 2048, true],
        ["BIGINT", 1.5, true],
        ["DOUBLE", 9007199254740993n, true],
        ["INTEGER", Infinity, true],
        ["INTEGER", "42", false],
        ["VARCHAR", 42, false],
        ["BOOLEAN", 1, false],
        ["TIMESTAMP", "2020-01-01", false],
        ["TIMESTAMP", new Date(NaN), false],
        ["DATE", new Date("2020-01-01T00:00:00.001Z"), true],
        ["TIME", new Date("2020-01-01"), true],
        ["FLOAT[2]", [0.1, 2], true],
        ["FLOAT[2]", [1], true],
      ] as const
    ) {
      const error = assertThrows(
        () =>
          table.loadArray([{ value: null }, { value }], {
            columnTypes: { value: type },
          }),
        Error,
      );
      const displayed = typeof value === "string"
        ? JSON.stringify(value)
        : String(value);
      assertEquals(
        error.message,
        `Column "value", row 2: value ${displayed} ${
          loss
            ? `cannot be stored as ${type} without losing information`
            : `is incompatible with ${type}`
        }. Select a type compatible with this value.`,
      );
    }
    assertEquals(await table.getData(), [{ value: 7 }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray preserves exact numeric values under overrides", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadArray([
      {
        integer: -2147483648,
        big: -9223372036854775808n,
        double: 9007199254740992n,
      },
      { integer: 2147483647, big: 42, double: 0.1 },
    ], {
      columnTypes: { integer: "INTEGER", big: "BIGINT", double: "DOUBLE" },
    });
    assertEquals(
      await sdb.customQuery(
        `SELECT integer, big::VARCHAR AS big, double FROM "${table.name}"`,
        { returnData: true },
      ),
      [
        {
          integer: -2147483648,
          big: "-9223372036854775808",
          double: 9007199254740992,
        },
        { integer: 2147483647, big: "42", double: 0.1 },
      ],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray snapshots explicitly typed dates and arrays without losing values", async () => {
  const sdb = new SimpleDB();
  try {
    const date = new Date("2020-01-01T12:34:56.789Z");
    const vector = [1.5, 2];
    const table = sdb.newTable().loadArray([
      { date, vector, missing: NaN },
    ], {
      columnTypes: {
        date: "datetimeTz",
        vector: "FLOAT[2]",
        missing: "INTEGER",
      },
    });
    date.setUTCFullYear(2030);
    vector[0] = 99;
    assertEquals(
      await sdb.customQuery(
        `SELECT date::TIMESTAMP AS date, vector[1] AS first, vector[2] AS second, missing FROM "${table.name}"`,
        { returnData: true },
      ),
      [{
        date: new Date("2020-01-01T12:34:56.789Z"),
        first: 1.5,
        second: 2,
        missing: null,
      }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray preserves numeric BIGINT boundaries", async () => {
  const sdb = new SimpleDB();
  try {
    const values = [-(2 ** 63), 2 ** 63 - 1024, 9007199254740992];
    const table = sdb.newTable().loadArray(values.map((value) => ({ value })), {
      columnTypes: { value: "BIGINT" },
    });
    assertEquals(
      await sdb.customQuery(
        `SELECT value::VARCHAR AS value FROM "${table.name}"`,
        { returnData: true },
      ),
      values.map((value) => ({ value: BigInt(value).toString() })),
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray nested documents can be loaded as JSON text and converted with SQL", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  const lines: string[] = [];
  try {
    const table = sdb.newTable("nested_documents");
    assertThrows(
      () => table.loadArray([{ document: { count: 2 } }]),
      Error,
      "Type object not supported",
    );
    table.loadArray([{
      document: JSON.stringify({ scores: [1, null, 3], details: { count: 2 } }),
    }]);
    // customQuery flushes the queued loadArray before creating SQL nested values.
    await sdb.customQuery(`CREATE OR REPLACE TABLE nested_documents AS SELECT
      from_json(document, '{"scores":["INTEGER"],"details":{"count":"INTEGER"}}') AS document
      FROM nested_documents`);
    assertEquals(await table.getData(), [{
      document: { scores: [1, null, 3], details: { count: 2 } },
    }]);
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    await table.log();
    assertEquals(
      lines.join("\n").includes('{"scores":[1,null,3],"details":{"count":2}}'),
      true,
    );
    const vectors = sdb.newTable().loadArray([{ values: [1, 2, 3] }]);
    assertEquals(await vectors.getData(), [{ values: "<FLOAT[3]>" }]);
    await vectors.log();
    assertEquals(lines.join("\n").includes("<FLOAT[3]>"), true);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

Deno.test("loadArray ingests explicit GeoJSON kinds, collections, empty geometries and nulls", async () => {
  const sdb = new SimpleDB();
  const originalLog = console.log;
  try {
    const point = [-73.57123456789012, 45.50123456789012];
    const ring = [[0, 0], [1, 0], [1, 1], [0, 0]];
    const geometries = [
      { type: "Point", coordinates: point },
      { type: "LineString", coordinates: [[0, 0], [1, 1]] },
      { type: "Polygon", coordinates: [ring] },
      { type: "MultiPoint", coordinates: [[0, 0], [1, 1]] },
      { type: "MultiLineString", coordinates: [[[0, 0], [1, 1]]] },
      { type: "MultiPolygon", coordinates: [[ring]] },
      {
        type: "GeometryCollection",
        geometries: [
          { type: "Point", coordinates: point },
          {
            type: "GeometryCollection",
            geometries: [{ type: "Polygon", coordinates: [ring] }],
          },
        ],
      },
      ...["Polygon", "MultiPoint", "MultiLineString", "MultiPolygon"].map((
        type,
      ) => ({ type, coordinates: [] })),
      { type: "GeometryCollection", geometries: [] },
      null,
    ];
    const table = sdb.newTable("geometries").loadArray(
      geometries.map((geom, id) => ({ id, geom, second: geom, missing: null })),
      {
        columnTypes: {
          geom: "GEOMETRY('EPSG:4326')",
          second: "geometry('EPSG:4326')",
          missing: "GEOMETRY('EPSG:4326')",
        },
      },
    );
    assertEquals(await table.getTypes(), {
      id: "DOUBLE",
      geom: "GEOMETRY('EPSG:4326')",
      second: "GEOMETRY('EPSG:4326')",
      missing: "GEOMETRY('EPSG:4326')",
    });
    const data = await sdb.customQuery(
      "SELECT id, ST_AsGeoJSON(geom)::VARCHAR AS geom, ST_AsGeoJSON(second)::VARCHAR AS second, missing IS NULL AS missing FROM geometries ORDER BY id",
      { returnData: true },
    );
    assertEquals(
      data?.map((row) => ({
        ...row,
        geom: row.geom === null ? null : JSON.parse(row.geom as string),
        second: row.second === null ? null : JSON.parse(row.second as string),
      })),
      geometries.map((geom, id) => ({ id, geom, second: geom, missing: true })),
    );
    assertEquals(
      await sdb.customQuery(
        "SELECT ST_X(geom) AS x, ST_Y(geom) AS y, ST_AsText(geom) AS wkt FROM geometries WHERE id = 0",
        { returnData: true },
      ),
      [{ x: point[0], y: point[1], wkt: `POINT (${point[0]} ${point[1]})` }],
    );
    const lines: string[] = [];
    console.log = (...args: unknown[]) => {
      lines.push(args.map(String).join(" "));
    };
    await table.log();
    assertEquals(lines.join("\n").includes("GEOM(EPSG:4326)"), true);
  } finally {
    console.log = originalLog;
    await sdb.close();
  }
});

Deno.test("loadArray preserves signed zero in nested geometry coordinates", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.newTable("signed_zero").loadArray([
      {
        geom: { type: "Point", coordinates: [-0, 0] },
        wkt: "POINT (-0.0 0)",
      },
      {
        geom: {
          type: "GeometryCollection",
          geometries: [{ type: "Point", coordinates: [0, -0] }],
        },
        wkt: "GEOMETRYCOLLECTION (POINT (0 -0.0))",
      },
      {
        geom: {
          type: "Polygon",
          coordinates: [[[-0, 0], [1, 0], [1, 1], [-0, 0]]],
        },
        wkt: "POLYGON ((-0.0 0, 1 0, 1 1, -0.0 0))",
      },
    ], { columnTypes: { geom: "GEOMETRY('EPSG:4326')" } }).run();
    assertEquals(
      await sdb.customQuery(
        "SELECT ST_AsWKB(geom) = ST_AsWKB(ST_GeomFromText(wkt)) AS preserved FROM signed_zero",
        { returnData: true },
      ),
      [{ preserved: true }, { preserved: true }, { preserved: true }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray snapshots nested geometry input at call time", async () => {
  const sdb = new SimpleDB();
  try {
    const point = {
      type: "Point",
      coordinates: [12.1234567890123, 34.1234567890123],
    };
    const geom = { type: "GeometryCollection", geometries: [point] };
    const expected = JSON.stringify(geom);
    const rows = [{ geom }];
    const table = sdb.newTable("snapshot_geo").loadArray(rows, {
      columnTypes: { geom: "GEOMETRY('EPSG:4326')" },
    });
    point.coordinates[0] = 80;
    point.type = "Bad";
    geom.geometries.push(point);
    rows.length = 0;
    await table.run();
    const data = await sdb.customQuery(
      "SELECT ST_AsGeoJSON(geom)::VARCHAR AS geom FROM snapshot_geo",
      { returnData: true },
    );
    assertEquals(JSON.parse(data![0].geom as string), JSON.parse(expected));
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray rejects malformed geometries with row context and preserves existing data", async () => {
  const sdb = new SimpleDB();
  try {
    const table = await sdb.newTable().loadArray([{ value: 7 }]);
    const cycle: { type: string; geometries: unknown[] } = {
      type: "GeometryCollection",
      geometries: [],
    };
    cycle.geometries.push(cycle);
    for (
      const value of [
        undefined,
        NaN,
        "POINT (0 0)",
        {},
        [],
        cycle,
        { type: "Feature", geometry: null },
        { type: "FeatureCollection", features: [] },
        { type: "Point", coordinates: [] },
        { type: "Point", coordinates: [1, 2, 3] },
        { type: "Point", coordinates: [1, Infinity] },
        { type: "Point", coordinates: [181, 0] },
        { type: "Point", coordinates: new Array(2) },
        { type: "Point", coordinates: [0, 91] },
        { type: "Point", coordinates: ["0", 1] },
        { type: "Point", coordinates: [0, 0], crs: "EPSG:3857" },
        { type: "LineString", coordinates: [] },
        { type: "LineString", coordinates: [[0, 0]] },
        { type: "Polygon", coordinates: [[]] },
        { type: "Polygon", coordinates: [[[0, 0], [1, 1], [1, 0], [2, 2]]] },
        { type: "GeometryCollection", geometries: [null] },
        { type: "MultiPolygon", coordinates: ["bad"] },
      ]
    ) {
      assertThrows(
        () =>
          table.loadArray([{ value: null }, { value }], {
            columnTypes: { value: "GEOMETRY('EPSG:4326')" },
          }),
        Error,
        'Column "value", row 2:',
      );
    }
    for (
      const type of [
        "GEOMETRY",
        "GEOMETRY('EPSG:3857')",
        "GEOMETRY('OGC:CRS84')",
      ]
    ) {
      assertThrows(
        () =>
          // @ts-expect-error Unsupported geometry declarations are rejected at runtime too.
          table.loadArray([{ value: null }], { columnTypes: { value: type } }),
        Error,
        "requires GEOMETRY('EPSG:4326')",
      );
    }
    assertThrows(
      () =>
        table.loadArray([{ value: { type: "Point", coordinates: [0, 0] } }]),
      Error,
      "Type object not supported",
    );
    assertEquals(await table.getData(), [{ value: 7 }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray SQL conversion failure preserves destination and cleans staging", async () => {
  const sdb = new SimpleDB();
  try {
    const table = await sdb.newTable("preserved_geometry").loadArray([{
      value: 7,
    }]);
    const prepared = prepareArray([{
      value: { type: "Point", coordinates: [0, 0] },
    }], { value: "GEOMETRY('EPSG:4326')" });
    // Inject a conversion failure after JavaScript preparation has succeeded.
    prepared.columnsData[0][0] = "invalid JSON";
    await assertRejects(() => executePreparedArray(table, prepared));
    assertEquals(await table.getData(), [{ value: 7 }]);
    assertEquals(
      await sdb.customQuery(
        "SELECT table_name FROM duckdb_tables() WHERE temporary AND starts_with(table_name, '__sda_array_')",
        { returnData: true },
      ),
      [],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadArray stages geometry batches with quoted identifiers and cleans up", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable('geo "batches"');
    await table.loadArray(
      Array.from({ length: 2001 }, (_, id) => ({
        id,
        'geo "point"': { type: "Point", coordinates: [id / 100, 45] },
      })),
      { columnTypes: { 'geo "point"': "GEOMETRY('EPSG:4326')" } },
    ).run();
    assertEquals(
      await sdb.customQuery(
        `SELECT count(*) AS count, max(ST_X("geo ""point""")) AS maximum FROM "geo ""batches"""`,
        { returnData: true },
      ),
      [{ count: 2001, maximum: 20 }],
    );
    assertEquals(
      await sdb.customQuery(
        "SELECT table_name FROM duckdb_tables() WHERE temporary AND starts_with(table_name, '__sda_array_')",
        { returnData: true },
      ),
      [],
    );
  } finally {
    await sdb.close();
  }
});
