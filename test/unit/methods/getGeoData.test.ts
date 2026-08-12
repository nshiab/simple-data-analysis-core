import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import { readFileSync } from "node:fs";
import rewind from "../../../src/helpers/rewind.ts";

Deno.test("should find the column with geometries and return geospatial data as a geojson", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.renameColumns({ geom: "newGeom" });
  const geoData = await table.getGeoData();

  assertEquals(geoData, {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "polygonA" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-80.5925744, 50.3447571],
              [-81.4683036, 44.963885],
              [-75.0907732, 46.9689849],
              [-75.5601513, 50.1474736],
              [-80.5925744, 50.3447571],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "polygonB" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-121.9581024, 62.0110577],
              [-122.3017867, 56.0464801],
              [-112.2459009, 51.5685044],
              [-104.838484, 51.4335657],
              [-96.8420125, 53.4420801],
              [-98.0491012, 62.4259071],
              [-121.9581024, 62.0110577],
            ],
          ],
        },
      },
    ],
  });

  await sdb.close();
});

Deno.test("should return geospatial data as a geojson with a specific geometry column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.renameColumns({ geom: "newGeom" });
  const geoData = await table.getGeoData("newGeom");

  assertEquals(geoData, {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "polygonA" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-80.5925744, 50.3447571],
              [-81.4683036, 44.963885],
              [-75.0907732, 46.9689849],
              [-75.5601513, 50.1474736],
              [-80.5925744, 50.3447571],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "polygonB" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-121.9581024, 62.0110577],
              [-122.3017867, 56.0464801],
              [-112.2459009, 51.5685044],
              [-104.838484, 51.4335657],
              [-96.8420125, 53.4420801],
              [-98.0491012, 62.4259071],
              [-121.9581024, 62.0110577],
            ],
          ],
        },
      },
    ],
  });

  await sdb.close();
});

Deno.test("should quote unusual geometry column names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geoData");
  const geometryColumn = 'geo "column';

  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.renameColumns({ geom: geometryColumn });
  const geoData = await table.getGeoData(geometryColumn);

  assertEquals(geoData.features.length, 2);

  await sdb.close();
});

Deno.test("should return geospatial data not rewinded", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/economicRegions-simplified.json");
  const geoData = await table.getGeoData();

  const originalData = JSON.parse(
    readFileSync("test/geodata/files/economicRegions-simplified.json", "utf-8"),
  );

  assertEquals(geoData, originalData);

  await sdb.close();
});
Deno.test("should return geospatial data rewinded", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/economicRegions-simplified.json");
  const geoData = await table.getGeoData(undefined, { rewind: true });

  const rewindedData = rewind(JSON.parse(
    readFileSync("test/geodata/files/economicRegions-simplified.json", "utf-8"),
  )) as {
    type: string;
    features: unknown[];
  };

  assertEquals(geoData, rewindedData);

  await sdb.close();
});

Deno.test("file transport converts date-valued GeoJSON properties", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("datedGeoData");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.addColumn("observed", "date", "'2020-01-15'");

  const geoData = await table.getGeoData();
  assertEquals(
    (geoData.features[0] as { properties: { observed: unknown } }).properties
      .observed,
    new Date("2020-01-15T00:00:00.000Z"),
  );
  await sdb.close();
});

Deno.test("file transport preserves multiple geometry-column selection", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("multipleGeometries");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.cloneColumn("geom", "otherGeom");

  await assertRejects(
    () => table.getGeoData(),
    Error,
    "More than one column storing geometries",
  );
  const geoData = await table.getGeoData("geom");
  assertEquals(geoData.features.length, 2);
  assertEquals(
    typeof (geoData.features[0] as { properties: { otherGeom: unknown } })
      .properties.otherGeom,
    "string",
  );
  await sdb.close();
});
