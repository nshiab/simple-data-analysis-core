import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

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
