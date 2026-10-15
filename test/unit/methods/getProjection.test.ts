import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the projection of a column", async () => {
  const sdb = new SimpleDB();
  const table = sdb
    .newTable()
    .loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");

  const projection = await table.getProjection("geom");
  expect(projection).toStrictEqual("GEOMETRY('EPSG:4326')");
  await sdb.close();
});
