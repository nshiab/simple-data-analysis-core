import {
  assert,
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "@std/assert";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";
import SDAError from "../../../src/class/SDAError.ts";

function spyOnQueries(table: SimpleTable): string[] {
  const queries: string[] = [];
  const original = table.runQuery;
  table.runQuery = (query, connection, returnData, options) => {
    queries.push(query);
    return original(query, connection, returnData, options);
  };
  return queries;
}

Deno.test("should load an OSM XML file with geom geometries", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("osmFixture");
  table.loadGeoData("test/geodata/files/osm-fixture.osm");

  assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
  assertEquals(
    await sdb.customQuery(
      `SELECT kind, type, id, ST_AsText(geom) AS wkt
      FROM osmFixture WHERE id IN (1, 10, 20) ORDER BY id`,
      { returnData: true },
    ),
    [
      { kind: "node", type: "node", id: 1, wkt: "POINT (-73.599 45.501)" },
      {
        kind: "area",
        type: "way",
        id: 10,
        wkt:
          "POLYGON ((-73.598 45.502, -73.596 45.502, -73.596 45.504, -73.598 45.504, -73.598 45.502))",
      },
      {
        kind: "area",
        type: "relation",
        id: 20,
        wkt:
          "MULTIPOLYGON (((-73.595 45.505, -73.593 45.505, -73.593 45.507, -73.595 45.507, -73.595 45.505)))",
      },
    ],
  );
  await sdb.close();
});

Deno.test("should project selected OSM columns while loading", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectedOsm");
  const queries = spyOnQueries(table);
  table.loadGeoData("test/geodata/files/osm-fixture.osm", {
    columns: ["kind", "id", "geom"],
  });

  assertEquals(await table.getColumns(), ["kind", "id", "geom"]);
  assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
  const loadQuery = queries.find((query) => query.includes("osmium_read"));
  assert(loadQuery !== undefined);
  assertStringIncludes(
    loadQuery,
    `SELECT "kind", "id", "geom"`,
  );
  await sdb.close();
});

for (
  const { file, conditions } of [
    {
      file: "test/geodata/files/CanadianProvincesAndTerritories.json",
      conditions: "nameEnglish === 'Quebec' && nameFrench === 'Québec'",
    },
    {
      file:
        "test/geodata/files/CanadianProvincesAndTerritories/CanadianProvincesAndTerritories.shp",
      conditions: "nameEnglis = 'Quebec'",
    },
    {
      file: "test/geodata/files/CanadianProvincesAndTerritories.shp.zip",
      conditions: "nameEnglis = 'Quebec'",
    },
    {
      file: "test/geodata/files/data.geoparquet",
      conditions: "name = 'polygonB'",
    },
    {
      file: "test/geodata/files/osm-fixture.osm",
      conditions: "id = 1 AND ST_X(geom) < -73",
    },
  ]
) {
  Deno.test(`loadGeoData applies conditions before projection: ${file}`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable();
      const queries = spyOnQueries(table);
      table.loadGeoData(file, { conditions, columns: ["geom"] });
      assertEquals(await table.getRowCount(), 1);
      assertEquals(await table.getColumns(), ["geom"]);
      const writes = queries.filter((query) =>
        query.includes("CREATE OR REPLACE TABLE")
      );
      assertEquals(writes.length, 1);
      assertStringIncludes(writes[0], "WHERE");
    } finally {
      await sdb.close();
    }
  });
}

Deno.test("loadGeoData conditions can use OSM geom without retaining it", async () => {
  const sdb = new SimpleDB();
  try {
    assertEquals(
      await sdb.newTable().loadGeoData("test/geodata/files/osm-fixture.osm", {
        conditions: "kind = 'node' AND ST_X(geom) < -73.5985",
        columns: ["id"],
      }).getData(),
      [{ id: 1 }],
    );
  } finally {
    await sdb.close();
  }
});

Deno.test("loadGeoData captures conditions and handles empty, unmatched, and invalid conditions", async () => {
  const sdb = new SimpleDB();
  try {
    const file = "test/geodata/files/pointsInside.json";
    const options = { conditions: "name = 'pointB'", columns: ["name"] };
    const captured = sdb.newTable().loadGeoData(file, options);
    options.conditions = "FALSE";
    assertEquals(await captured.getData(), [{ name: "pointB" }]);
    for (const conditions of [undefined, "", "FALSE"]) {
      const table = sdb.newTable().loadGeoData(file, { conditions });
      assertEquals(await table.getRowCount(), conditions === "FALSE" ? 0 : 4);
      assertEquals(await table.getColumns(), ["name", "geom"]);
    }
    for (const conditions of ["missing_column > 1", "name ="]) {
      const table = sdb.newTable().loadGeoData(file, { conditions });
      const error = await assertRejects(() => table.getData(), SDAError);
      assertEquals(error.method, "loadGeoData()");
      assertEquals(error.parameters, { file, options: { conditions } });
    }
  } finally {
    await sdb.close();
  }
});

Deno.test("loadGeoData applies geometry conditions before reprojection", async () => {
  const sdb = new SimpleDB();
  const file = await Deno.makeTempFile({ suffix: ".geoparquet" });
  try {
    await sdb.customQuery(`
      INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;
      COPY (
        SELECT ST_Point(x, 2000000)::GEOMETRY('EPSG:3857') AS geom
        FROM (VALUES (0), (1000000)) AS points(x)
      ) TO '${file}' (FORMAT PARQUET)
    `);
    const table = sdb.newTable().loadGeoData(file, {
      conditions: "ST_X(geom) > 1000",
      toEPSG4326: true,
    });
    assertEquals(await table.getRowCount(), 1);
    assertEquals(await table.getProjection("geom"), "GEOMETRY('EPSG:4326')");
    assertEquals(await table.filter("ST_X(geom) < 180").getRowCount(), 1);
  } finally {
    await sdb.close();
    await Deno.remove(file);
  }
});

Deno.test("loadGeoData tracks table dependencies in conditions for cache invalidation", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("geoLoadConditionsSource");
    const output = sdb.newTable("geoLoadConditionsOutput");
    source.loadArray([{ name: "pointA" }, { name: "pointB" }]);
    let runs = 0;
    const compute = () => {
      runs++;
      output.loadGeoData("test/geodata/files/pointsInside.json", {
        conditions: `name IN (SELECT name FROM "${source.name}")`,
        columns: ["name"],
      });
    };
    await output.cache(compute);
    await output.cache(compute);
    assertEquals(runs, 1);
    source.filter("name = 'pointB'");
    await output.cache(compute);
    assertEquals(runs, 2);
    assertEquals(await output.getData(), [{ name: "pointB" }]);
  } finally {
    await sdb.close();
  }
});

Deno.test("should load an OSM PBF file with geom geometries", async () => {
  const file = join(tmpdir(), `${crypto.randomUUID()}.osm.pbf`);
  // Base64-encoded osmium-tool test/formats/f1.osm.pbf fixture.
  const fixture =
    "AAAADQoJT1NNSGVhZGVyGC8QIxoreJxT4vMvzg1OzkjNTdQNM9AzU+JySc0rTvXLT0ktbmJkKUktLgEAv2ALIwAAAAsKB09TTURhdGEYchBvGm54nOPi52LgYilJLS4B0sxp+flCMUJRXCwiTExMWtpcLIxAICTY8OblZs4DH+fY3Gu/ZNnUfUZBioWJgYlJiYWJkY1ZiwWoltlJoOHWEc45b95xPjk+ixPE9uIFkR/2zGd6D8QMQSwMQAAAED0gQwAAAAsKB09TTURhdGEYYhBkGl54nONS5mLgYk7LzwdRFZVVXMyKDipczEmJRVzMWsr6XCwlqcUlQrZSyhwiQiyMTMwsUiysrExsSnwcjAITdkxayirBosCowe7ELMLEJCXGIYokwQiWYJJgAgAspg+lAAAACwoHT1NNRGF0YRhTEEgaT3ic45LjYuBirqis4mJOTErmYilJLS4BinAU5+emKpQnVgqpKalwyAkxMkoxMinxcTAKTNgxaSmrBKMCowazExMLqxeThEAQEwMjABQPDQo=";
  writeFileSync(file, Buffer.from(fixture, "base64"));

  try {
    const sdb = new SimpleDB();
    const table = sdb.newTable("osmPbfFixture");
    table.loadGeoData(file);

    assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
    assertEquals(
      await sdb.customQuery(
        `SELECT kind, type, id, ST_AsText(geom) AS wkt
        FROM osmPbfFixture WHERE id = 20`,
        { returnData: true },
      ),
      [{
        kind: "line",
        type: "way",
        id: 20,
        wkt: "LINESTRING (1 1, 1.2355 2.034523, 1 3)",
      }],
    );
    await sdb.close();
  } finally {
    rmSync(file, { force: true });
  }
});

Deno.test("should stage and remove a remote OSM XML file", async () => {
  rmSync(".sda-cache", { recursive: true, force: true });
  const fixture = readFileSync("test/geodata/files/osm-fixture.osm");
  const server = Deno.serve(
    { hostname: "127.0.0.1", port: 0 },
    () => new Response(fixture),
  );
  const url =
    `http://${server.addr.hostname}:${server.addr.port}/fixture.osm?download=1`;

  try {
    const sdb = new SimpleDB();
    const table = sdb.newTable();
    table.loadGeoData(url);
    assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
    await sdb.close();
    assertEquals(readdirSync(".sda-cache/tmp"), []);
  } finally {
    await server.shutdown();
    rmSync(".sda-cache", { recursive: true, force: true });
  }
});

Deno.test("should escape geospatial file paths containing apostrophes", async () => {
  await Deno.mkdir("test/output", { recursive: true });
  const file = "test/output/point's.json";
  await Deno.copyFile("test/geodata/files/point.json", file);

  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(file);

  assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
  await sdb.close();
});

Deno.test("should load a geojson file and return the table", async () => {
  const sdb = new SimpleDB();
  const table = await sdb
    .newTable()
    .loadGeoData(
      "test/geodata/files/CanadianProvincesAndTerritories.json",
    );

  assertEquals(table instanceof SimpleTable, true);
  await table.run();
  await sdb.close();
});

Deno.test("should load a geojson file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const types = await table.getTypes();

  assertEquals(types, {
    nameEnglish: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

Deno.test("should project selected GeoJSON columns while loading", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectedGeoJSON");
  const queries = spyOnQueries(table);
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
    { columns: ["nameEnglish", "geom"] },
  );

  assertEquals(await table.getTypes(), {
    nameEnglish: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  const loadQuery = queries.find((query) => query.includes("ST_Read"));
  assert(loadQuery !== undefined);
  assertStringIncludes(
    loadQuery,
    'AS SELECT "nameEnglish", "geom" FROM ST_Read',
  );
  await sdb.close();
});

Deno.test("should load a geojson file from a URL", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const types = await table.getTypes();

  assertEquals(types, {
    nameEnglish: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

Deno.test("should load a shapefile file (not zipped)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories/CanadianProvincesAndTerritories.shp",
  );

  const types = await table.getTypes();

  assertEquals(types, {
    nameEnglis: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

Deno.test("should load a shapefile file (zipped)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.shp.zip",
  );

  const types = await table.getTypes();

  assertEquals(types, {
    nameEnglis: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

Deno.test("should load a GeoJSON file in EPSG:4326", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/point.json");
  table.extractLatLon("geom", "lat", "lon");
  table.selectColumns(["lat", "lon"]);

  const data = await table.getData();

  assertEquals(data, [
    { lat: 45.51412791316409, lon: -73.62315106245389 },
  ]);
  await sdb.close();
});

Deno.test("should load a geoparquet file", async () => {
  const sdb = new SimpleDB();
  const table = await sdb
    .newTable()
    .loadGeoData(
      "test/geodata/files/data.geoparquet",
    );

  assertEquals(await table.getGeoData(), {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [50.3447571, -80.5925744],
          [44.963885, -81.4683036],
          [46.9689849, -75.0907732],
          [50.1474736, -75.5601513],
          [50.3447571, -80.5925744],
        ]],
      },
      "properties": { "name": "polygonA" },
    }, {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [62.0110577, -121.9581024],
          [56.0464801, -122.3017867],
          [51.5685044, -112.2459009],
          [51.4335657, -104.838484],
          [53.4420801, -96.8420125],
          [62.4259071, -98.0491012],
          [62.0110577, -121.9581024],
        ]],
      },
      "properties": { "name": "polygonB" },
    }],
  });
  await sdb.close();
});
Deno.test("should load a compressed geoparquet file", async () => {
  const sdb = new SimpleDB();
  const table = await sdb
    .newTable()
    .loadGeoData(
      "test/geodata/files/data-compressed.geoparquet",
    );

  assertEquals(await table.getGeoData(), {
    "type": "FeatureCollection",
    "features": [{
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [50.3447571, -80.5925744],
          [44.963885, -81.4683036],
          [46.9689849, -75.0907732],
          [50.1474736, -75.5601513],
          [50.3447571, -80.5925744],
        ]],
      },
      "properties": { "name": "polygonA" },
    }, {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [62.0110577, -121.9581024],
          [56.0464801, -122.3017867],
          [51.5685044, -112.2459009],
          [51.4335657, -104.838484],
          [53.4420801, -96.8420125],
          [62.4259071, -98.0491012],
          [62.0110577, -121.9581024],
        ]],
      },
      "properties": { "name": "polygonB" },
    }],
  });
  await sdb.close();
});

Deno.test("should load a geoparquet file with multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = await sdb
    .newTable()
    .loadGeoData(
      "test/geodata/files/data-multiple-columns.geoparquet",
    );

  assertEquals(await table.getTypes(), {
    name: "VARCHAR",
    geom: "GEOMETRY('OGC:CRS84')",
    anotherGeom: "GEOMETRY('OGC:CRS84')",
  });
  await sdb.close();
});

Deno.test("should project selected GeoParquet columns while loading", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectedGeoParquet");
  const queries = spyOnQueries(table);
  table.loadGeoData("test/geodata/files/data-multiple-columns.geoparquet", {
    columns: ["name", "anotherGeom"],
  });

  assertEquals(await table.getTypes(), {
    name: "VARCHAR",
    anotherGeom: "GEOMETRY('OGC:CRS84')",
  });
  const loadQuery = queries.find((query) => query.includes("read_parquet"));
  assert(loadQuery !== undefined);
  assertStringIncludes(
    loadQuery,
    'AS SELECT "name", "anotherGeom" FROM read_parquet',
  );
  await sdb.close();
});

Deno.test("should skip reprojection when the data is already in EPSG:4326", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/pointsInside.json", {
    toEPSG4326: true,
  });

  const projection = await table.getProjection("geom");
  assertEquals(projection, "GEOMETRY('EPSG:4326')");

  const withoutOption = sdb.newTable("geodataWithout");
  withoutOption.loadGeoData("test/geodata/files/pointsInside.json");

  assertEquals(await table.getGeoData(), await withoutOption.getGeoData());

  await sdb.close();
});
