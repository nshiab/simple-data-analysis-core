import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the bounding box in [minX, minY, maxX, maxY]", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  const bbox = await table.getBoundingBox();
  expect(bbox).toStrictEqual([-141.014, 41.981, -52.636, 83.111]);
  await sdb.close();
});

test("should return the bounding box in [minX, minY, maxX, maxY] from a specific column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  const bbox = await table.getBoundingBox("geom");
  expect(bbox).toStrictEqual([-141.014, 41.981, -52.636, 83.111]);
  await sdb.close();
});
