import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should flip the coordinates", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/point.json");
  table.flipCoordinates();

  const types = await table.getTypes();
  expect(types.geom).toStrictEqual("GEOMETRY('EPSG:4326')");

  const data = await sdb.customQuery(`SELECT ST_AsText(geom) as geomText FROM geoData;`, {
    returnData: true,
  });

  expect(data).toStrictEqual([{ geomText: "POINT (45.51412791316409 -73.62315106245389)" }]);
  await sdb.close();
});

test("should flip the coordinates from a specific column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/point.json");
  table.flipCoordinates("geom");
  const data = await sdb.customQuery(`SELECT ST_AsText(geom) as geomText FROM geoData;`, {
    returnData: true,
  });

  expect(data).toStrictEqual([{ geomText: "POINT (45.51412791316409 -73.62315106245389)" }]);
  await sdb.close();
});
