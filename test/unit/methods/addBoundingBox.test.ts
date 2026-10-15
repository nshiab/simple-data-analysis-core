import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should create minLon, maxLon, minLat, maxLat columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  table.addBoundingBox({ decimals: 3 });
  table.removeColumns("geom");
  const data = await table.getData();

  // Ontario
  const ontario = data.find((d) => d.nameEnglish === "Ontario") as {
    [key: string]: number | string;
  };
  expect(ontario.minLon).toStrictEqual(-95.153);
  expect(ontario.maxLon).toStrictEqual(-74.343);
  expect(ontario.minLat).toStrictEqual(41.981);
  expect(ontario.maxLat).toStrictEqual(56.851);

  await sdb.close();
});

test("should create minLon, maxLon, minLat, maxLat columns for a specific column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  table.addBoundingBox({ column: "geom", decimals: 1 });
  table.removeColumns("geom");
  const data = await table.getData();

  // Ontario
  const ontario = data.find((d) => d.nameEnglish === "Ontario") as {
    [key: string]: number | string;
  };
  expect(ontario.minLon).toStrictEqual(-95.2);
  expect(ontario.maxLon).toStrictEqual(-74.3);
  expect(ontario.minLat).toStrictEqual(42);
  expect(ontario.maxLat).toStrictEqual(56.9);

  await sdb.close();
});
