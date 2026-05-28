import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should create points", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData("test/geodata/files/coordinates.csv");
  await table.convert({ lat: "double", lon: "double" });
  await table.points("lat", "lon", "geom");

  const data = await table.getGeoData("geom");

  assertEquals(data, {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-79.29, 43.77] },
        properties: { name: "montreal", lat: 43.77, lon: -79.29 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-73.86, 45.35] },
        properties: { name: "toronto", lat: 45.35, lon: -73.86 },
      },
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.96, 49.07] },
        properties: { name: "vancouver", lat: 49.07, lon: -122.96 },
      },
    ],
  });

  const types = await table.getTypes();
  assertEquals(types, {
    name: "VARCHAR",
    lat: "DOUBLE",
    lon: "DOUBLE",
    geom: "GEOMETRY('EPSG:4326')",
  });

  await sdb.done();
});

Deno.test("points() should overwrite existing column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { lat: 1, lon: 2, geom: "old" },
    { lat: 3, lon: 4, geom: "old" },
  ]);

  await table.points("lat", "lon", "geom");

  const types = await table.getTypes();
  assertEquals(types, {
    lat: "DOUBLE",
    lon: "DOUBLE",
    geom: "GEOMETRY('EPSG:4326')",
  });

  await sdb.done();
});
