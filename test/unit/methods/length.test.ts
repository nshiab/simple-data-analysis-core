import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should calculate the length of geometries in meters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length");
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  expect(data).toStrictEqual([{ length: 70175 }]);
  await sdb.close();
});

test("should calculate the length of geometries from a specific column in meters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length", { column: "geom" });
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  expect(data).toStrictEqual([{ length: 70175 }]);
  await sdb.close();
});

test("should calculate the length of geometries in meters from an EPSG:4326 file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length");
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  expect(data).toStrictEqual([{ length: 70175 }]);
  await sdb.close();
});

test("should calculate the length of geometries in kilometers", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length", { unit: "km" });
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  expect(data).toStrictEqual([{ length: 70 }]);
  await sdb.close();
});

test("should round lengths after converting their unit", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length", { unit: "km", decimals: 2 });
  table.selectColumns("length");

  expect(await table.getData()).toStrictEqual([{ length: 70.18 }]);

  await sdb.close();
});
