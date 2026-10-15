import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import { readFileSync } from "node:fs";
import rewind from "../../../src/helpers/rewind.ts";

test("should find the column with geometries and return geospatial data as a geojson", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.renameColumns({ geom: "newGeom" });
  const geoData = await table.getGeoData();

  expect(geoData).toStrictEqual({
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

test("should return geospatial data as a geojson with a specific geometry column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.renameColumns({ geom: "newGeom" });
  const geoData = await table.getGeoData({ column: "newGeom" });

  expect(geoData).toStrictEqual({
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

test("should quote unusual geometry column names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  const geometryColumn = 'geo "column';

  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.renameColumns({ geom: geometryColumn });
  const geoData = await table.getGeoData({ column: geometryColumn });

  expect(geoData.features.length).toStrictEqual(2);

  await sdb.close();
});

test("should return geospatial data not rewinded", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/economicRegions-simplified.json");
  const geoData = await table.getGeoData();

  const originalData: unknown = JSON.parse(
    readFileSync("test/geodata/files/economicRegions-simplified.json", "utf-8"),
  );

  expect(geoData).toStrictEqual(originalData);

  await sdb.close();
});
test("should return geospatial data rewinded", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/economicRegions-simplified.json");
  const geoData = await table.getGeoData({ rewind: true });

  const rewindedData = rewind(
    JSON.parse(readFileSync("test/geodata/files/economicRegions-simplified.json", "utf-8")),
  ) as {
    type: string;
    features: unknown[];
  };

  expect(geoData).toStrictEqual(rewindedData);

  await sdb.close();
});

test("should convert date-valued GeoJSON properties", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("datedGeoData");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.addColumn("observed", "date", "'2020-01-15'");

  const geoData = await table.getGeoData();
  expect(
    (geoData.features[0] as { properties: { observed: unknown } }).properties.observed,
  ).toStrictEqual(new Date("2020-01-15T00:00:00.000Z"));
  await sdb.close();
});

test("should preserve multiple geometry-column selection", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("multipleGeometries");
  table.loadGeoData("test/geodata/files/polygons.geojson");
  table.cloneColumn("geom", "otherGeom");

  await assertRejects(
    () => table.getGeoData(),
    Error,
    `getGeoData() found 2 geometry columns in table "multipleGeometries": "geom", "otherGeom". Specify one explicitly.`,
  );
  const geoData = await table.getGeoData({ column: "geom" });
  expect(geoData.features.length).toStrictEqual(2);
  expect(
    typeof (geoData.features[0] as { properties: { otherGeom: unknown } }).properties.otherGeom,
  ).toStrictEqual("string");
  await sdb.close();
});

test("should accept empty options and preserve explicit rewind false", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadGeoData("test/geodata/files/polygons.geojson");
    const expected = await table.getGeoData();
    expect(await table.getGeoData({})).toStrictEqual(expected);
    expect(await table.getGeoData({ rewind: false })).toStrictEqual(expected);
  } finally {
    await sdb.close();
  }
});

test("should combine column selection and rewinding without changing options", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable().loadGeoData("test/geodata/files/polygons.geojson");
    const original = await table.getGeoData();
    table.cloneColumn("geom", "otherGeom");
    const options = Object.freeze({ column: "otherGeom", rewind: true });
    const result = await table.getGeoData(options);
    const expected = rewind(original) as { features: { geometry: unknown }[] };
    expect(
      result.features.map((feature) => (feature as { geometry: unknown }).geometry),
    ).toStrictEqual(expected.features.map((feature) => feature.geometry));
    expect(options).toStrictEqual({ column: "otherGeom", rewind: true });
  } finally {
    await sdb.close();
  }
});
