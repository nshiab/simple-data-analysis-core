import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should add a new column with TRUE when geometries are closed", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/earthquake.geojson");
  table.unnestGeo("geom");
  table.addGeoClosedStatus("closed");
  table.selectColumns(["value", "closed"]);
  const data = await table.getData();

  expect(data).toStrictEqual([
    { value: 1.5, closed: false },
    { value: 2, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 3, closed: false },
    { value: 3, closed: false },
    { value: 3, closed: false },
    { value: 3.5, closed: false },
    { value: 3.5, closed: false },
    { value: 4, closed: false },
    { value: 4.5, closed: true },
    { value: 5, closed: true },
    { value: 5, closed: true },
    { value: 5, closed: true },
    { value: 5.5, closed: true },
    { value: 5.5, closed: true },
    { value: 6, closed: true },
    { value: 6.5, closed: true },
    { value: 7, closed: true },
    { value: 7.5, closed: true },
    { value: 7.5, closed: true },
    { value: 7.5, closed: true },
    { value: 8, closed: true },
  ]);

  await sdb.close();
});

test("should add a new column with TRUE when geometries in a specific column are closed", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/earthquake.geojson");
  table.unnestGeo("geom");
  table.addGeoClosedStatus("closed", { column: "geom" });
  table.selectColumns(["value", "closed"]);
  const data = await table.getData();

  expect(data).toStrictEqual([
    { value: 1.5, closed: false },
    { value: 2, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 2.5, closed: false },
    { value: 3, closed: false },
    { value: 3, closed: false },
    { value: 3, closed: false },
    { value: 3.5, closed: false },
    { value: 3.5, closed: false },
    { value: 4, closed: false },
    { value: 4.5, closed: true },
    { value: 5, closed: true },
    { value: 5, closed: true },
    { value: 5, closed: true },
    { value: 5.5, closed: true },
    { value: 5.5, closed: true },
    { value: 6, closed: true },
    { value: 6.5, closed: true },
    { value: 7, closed: true },
    { value: 7.5, closed: true },
    { value: 7.5, closed: true },
    { value: 7.5, closed: true },
    { value: 8, closed: true },
  ]);

  await sdb.close();
});
