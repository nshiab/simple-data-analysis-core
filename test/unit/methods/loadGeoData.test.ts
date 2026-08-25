import { assertEquals } from "@std/assert";
import { readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("should load an OSM XML file with geom geometries", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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

Deno.test("should load an OSM PBF file with geom geometries", async () => {
  const file = join(tmpdir(), `${crypto.randomUUID()}.osm.pbf`);
  // Base64-encoded osmium-tool test/formats/f1.osm.pbf fixture.
  const fixture =
    "AAAADQoJT1NNSGVhZGVyGC8QIxoreJxT4vMvzg1OzkjNTdQNM9AzU+JySc0rTvXLT0ktbmJkKUktLgEAv2ALIwAAAAsKB09TTURhdGEYchBvGm54nOPi52LgYilJLS4B0sxp+flCMUJRXCwiTExMWtpcLIxAICTY8OblZs4DH+fY3Gu/ZNnUfUZBioWJgYlJiYWJkY1ZiwWoltlJoOHWEc45b95xPjk+ixPE9uIFkR/2zGd6D8QMQSwMQAAAED0gQwAAAAsKB09TTURhdGEYYhBkGl54nONS5mLgYk7LzwdRFZVVXMyKDipczEmJRVzMWsr6XCwlqcUlQrZSyhwiQiyMTMwsUiysrExsSnwcjAITdkxayirBosCowe7ELMLEJCXGIYokwQiWYJJgAgAspg+lAAAACwoHT1NNRGF0YRhTEEgaT3ic45LjYuBirqis4mJOTErmYilJLS4BinAU5+emKpQnVgqpKalwyAkxMkoxMinxcTAKTNgxaSmrBKMCowazExMLqxeThEAQEwMjABQPDQo=";
  writeFileSync(file, Buffer.from(fixture, "base64"));

  try {
    const sdb = new SimpleDB({ dataTransport: "file" });
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
    const sdb = new SimpleDB({ dataTransport: "file" });
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

  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadGeoData(file);

  assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");
  await sdb.close();
});

Deno.test("should load a geojson file and return the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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
  const sdb = new SimpleDB({ dataTransport: "file" });
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

Deno.test("should load a geojson file from a URL", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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
  const sdb = new SimpleDB({ dataTransport: "file" });
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
  const sdb = new SimpleDB({ dataTransport: "file" });
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
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/point.json");
  table.latLon("geom", "lat", "lon");
  table.selectColumns(["lat", "lon"]);

  const data = await table.getData();

  assertEquals(data, [
    { lat: 45.51412791316409, lon: -73.62315106245389 },
  ]);
  await sdb.close();
});

Deno.test("should load a geoparquet file", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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
  const sdb = new SimpleDB({ dataTransport: "file" });
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
  const sdb = new SimpleDB({ dataTransport: "file" });
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

Deno.test("should skip reprojection when the data is already in EPSG:4326", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
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
