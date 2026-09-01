import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return the geometry types in a new column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table.addGeoType("type");
  table.selectColumns(["nameEnglish", "type"]);
  const data = await table.getData();

  assertEquals(data, [
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

Deno.test("should return the geometry types from a specific column in a new column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table.addGeoType("type");
  table.selectColumns(["nameEnglish", "type"]);
  const data = await table.getData();

  assertEquals(data, [
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
