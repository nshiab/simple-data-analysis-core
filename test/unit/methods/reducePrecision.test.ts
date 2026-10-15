import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should round the coordinates to 3 decimals", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/point.json");
  table.reducePrecision(3);

  const types = await table.getTypes();
  expect(types.geom).toStrictEqual("GEOMETRY('EPSG:4326')");

  const data = await sdb.customQuery(`SELECT ST_AsText(geom) as geomText FROM geoData;`, {
    returnData: true,
  });
  expect(data).toStrictEqual([{ geomText: "POINT (-73.623 45.514)" }]);
  await sdb.close();
});

test("should round the coordinates to 3 decimals from a specific column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/point.json");
  table.reducePrecision(3, { column: "geom" });
  const data = await sdb.customQuery(`SELECT ST_AsText(geom) as geomText FROM geoData;`, {
    returnData: true,
  });
  expect(data).toStrictEqual([{ geomText: "POINT (-73.623 45.514)" }]);
  await sdb.close();
});
