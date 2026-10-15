import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should return the geometry types in a new column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  table.addGeoType("type");
  table.selectColumns(["nameEnglish", "type"]);
  const data = await table.getData();

  expect(data).toStrictEqual([
    { nameEnglish: "Newfoundland and Labrador", type: "MULTIPOLYGON" },
    { nameEnglish: "Prince Edward Island", type: "POLYGON" },
    { nameEnglish: "Nova Scotia", type: "POLYGON" },
    { nameEnglish: "New Brunswick", type: "POLYGON" },
    { nameEnglish: "Quebec", type: "MULTIPOLYGON" },
    { nameEnglish: "Ontario", type: "MULTIPOLYGON" },
    { nameEnglish: "Manitoba", type: "POLYGON" },
    { nameEnglish: "Saskatchewan", type: "POLYGON" },
    { nameEnglish: "Alberta", type: "POLYGON" },
    { nameEnglish: "British Columbia", type: "MULTIPOLYGON" },
    { nameEnglish: "Yukon", type: "POLYGON" },
    { nameEnglish: "Northwest Territories", type: "MULTIPOLYGON" },
    { nameEnglish: "Nunavut", type: "MULTIPOLYGON" },
  ]);

  await sdb.close();
});

test("should use the specified geometry column when multiple columns exist", async () => {
  const sdb = new SimpleDB();
  try {
    await sdb.customQuery("INSTALL spatial; LOAD spatial;");
    await sdb.customQuery(`CREATE TABLE shapes AS SELECT
      ST_Point(0, 0) AS point,
      ST_GeomFromText('LINESTRING (0 0, 1 1)') AS line`);
    const table = sdb.newTable("shapes");
    table.addGeoType("type", { column: "line" }).selectColumns("type");
    expect(await table.getData()).toStrictEqual([{ type: "LINESTRING" }]);
  } finally {
    await sdb.close();
  }
});
