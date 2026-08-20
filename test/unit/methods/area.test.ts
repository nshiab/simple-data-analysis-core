import { assert, assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should explain when a table has no geometry column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("measurements");
  table.loadArray([{ value: 1 }]);

  const error = await assertRejects(() => table.area("area").run());
  assert(error instanceof Error);
  assertEquals(
    error.message,
    `area() could not find a geometry column in table "measurements". Specify a geometry column explicitly, or add one to the table first.`,
  );

  await sdb.close();
});

Deno.test("should list geometry columns when a table has multiple", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/point.json");
  table.cloneColumn("geom", "other geometry");

  const error = await assertRejects(() => table.area("area").run());
  assert(error instanceof Error);
  assertEquals(
    error.message,
    `area() found 2 geometry columns in table "geodata": "geom", "other geometry". Specify one explicitly.`,
  );

  await sdb.close();
});

Deno.test("should calculate the area of geometries in square meters", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table.area("area");
  table.selectColumns(["nameEnglish", "nameFrench", "area"]);
  table.round("area");
  const data = await table.getData();

  assertEquals(data, [
    {
      nameEnglish: "Newfoundland and Labrador",
      nameFrench: "Terre-Neuve-et-Labrador",
      area: 407428312235,
    },
    {
      nameEnglish: "Prince Edward Island",
      nameFrench: "Île-du-Prince-Édouard",
      area: 5922205562,
    },
    {
      nameEnglish: "Nova Scotia",
      nameFrench: "Nouvelle-Écosse",
      area: 56980046392,
    },
    {
      nameEnglish: "New Brunswick",
      nameFrench: "Nouveau-Brunswick",
      area: 72935040140,
    },
    {
      nameEnglish: "Quebec",
      nameFrench: "Québec",
      area: 1508203157285,
    },
    {
      nameEnglish: "Ontario",
      nameFrench: "Ontario",
      area: 980252087873,
    },
    {
      nameEnglish: "Manitoba",
      nameFrench: "Manitoba",
      area: 649626747368,
    },
    {
      nameEnglish: "Saskatchewan",
      nameFrench: "Saskatchewan",
      area: 652741441946,
    },
    {
      nameEnglish: "Alberta",
      nameFrench: "Alberta",
      area: 663023544390,
    },
    {
      nameEnglish: "British Columbia",
      nameFrench: "Colombie-Britannique",
      area: 938271085581,
    },
    { nameEnglish: "Yukon", nameFrench: "Yukon", area: 483592253984 },
    {
      nameEnglish: "Northwest Territories",
      nameFrench: "Territoires du Nord-Ouest",
      area: 1347423374589,
    },
    {
      nameEnglish: "Nunavut",
      nameFrench: "Nunavut",
      area: 2090913434132,
    },
  ]);

  await sdb.close();
});

Deno.test("should calculate the area of geometries in square meters from a specific column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table.area("area", { column: "geom" });
  table.selectColumns(["nameEnglish", "nameFrench", "area"]);
  table.round("area");
  const data = await table.getData();

  assertEquals(data, [
    {
      nameEnglish: "Newfoundland and Labrador",
      nameFrench: "Terre-Neuve-et-Labrador",
      area: 407428312235,
    },
    {
      nameEnglish: "Prince Edward Island",
      nameFrench: "Île-du-Prince-Édouard",
      area: 5922205562,
    },
    {
      nameEnglish: "Nova Scotia",
      nameFrench: "Nouvelle-Écosse",
      area: 56980046392,
    },
    {
      nameEnglish: "New Brunswick",
      nameFrench: "Nouveau-Brunswick",
      area: 72935040140,
    },
    {
      nameEnglish: "Quebec",
      nameFrench: "Québec",
      area: 1508203157285,
    },
    {
      nameEnglish: "Ontario",
      nameFrench: "Ontario",
      area: 980252087873,
    },
    {
      nameEnglish: "Manitoba",
      nameFrench: "Manitoba",
      area: 649626747368,
    },
    {
      nameEnglish: "Saskatchewan",
      nameFrench: "Saskatchewan",
      area: 652741441946,
    },
    {
      nameEnglish: "Alberta",
      nameFrench: "Alberta",
      area: 663023544390,
    },
    {
      nameEnglish: "British Columbia",
      nameFrench: "Colombie-Britannique",
      area: 938271085581,
    },
    { nameEnglish: "Yukon", nameFrench: "Yukon", area: 483592253984 },
    {
      nameEnglish: "Northwest Territories",
      nameFrench: "Territoires du Nord-Ouest",
      area: 1347423374589,
    },
    {
      nameEnglish: "Nunavut",
      nameFrench: "Nunavut",
      area: 2090913434132,
    },
  ]);

  await sdb.close();
});

Deno.test("should calculate the area of geometries in square meters from an EPSG:4326 file", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table.area("area");
  table.selectColumns(["nameEnglish", "nameFrench", "area"]);
  table.round("area");
  const data = await table.getData();

  assertEquals(data, [
    {
      nameEnglish: "Newfoundland and Labrador",
      nameFrench: "Terre-Neuve-et-Labrador",
      area: 407428312235,
    },
    {
      nameEnglish: "Prince Edward Island",
      nameFrench: "Île-du-Prince-Édouard",
      area: 5922205562,
    },
    {
      nameEnglish: "Nova Scotia",
      nameFrench: "Nouvelle-Écosse",
      area: 56980046392,
    },
    {
      nameEnglish: "New Brunswick",
      nameFrench: "Nouveau-Brunswick",
      area: 72935040140,
    },
    {
      nameEnglish: "Quebec",
      nameFrench: "Québec",
      area: 1508203157285,
    },
    {
      nameEnglish: "Ontario",
      nameFrench: "Ontario",
      area: 980252087873,
    },
    {
      nameEnglish: "Manitoba",
      nameFrench: "Manitoba",
      area: 649626747368,
    },
    {
      nameEnglish: "Saskatchewan",
      nameFrench: "Saskatchewan",
      area: 652741441946,
    },
    {
      nameEnglish: "Alberta",
      nameFrench: "Alberta",
      area: 663023544390,
    },
    {
      nameEnglish: "British Columbia",
      nameFrench: "Colombie-Britannique",
      area: 938271085581,
    },
    { nameEnglish: "Yukon", nameFrench: "Yukon", area: 483592253984 },
    {
      nameEnglish: "Northwest Territories",
      nameFrench: "Territoires du Nord-Ouest",
      area: 1347423374589,
    },
    {
      nameEnglish: "Nunavut",
      nameFrench: "Nunavut",
      area: 2090913434132,
    },
  ]);

  await sdb.close();
});

Deno.test("should calculate the area of geometries in square kilometers", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table.area("area", { unit: "km2" });
  table.selectColumns(["nameEnglish", "nameFrench", "area"]);
  table.round("area");
  const data = await table.getData();

  assertEquals(data, [
    {
      nameEnglish: "Newfoundland and Labrador",
      nameFrench: "Terre-Neuve-et-Labrador",
      area: 407428,
    },
    {
      nameEnglish: "Prince Edward Island",
      nameFrench: "Île-du-Prince-Édouard",
      area: 5922,
    },
    {
      nameEnglish: "Nova Scotia",
      nameFrench: "Nouvelle-Écosse",
      area: 56980,
    },
    {
      nameEnglish: "New Brunswick",
      nameFrench: "Nouveau-Brunswick",
      area: 72935,
    },
    { nameEnglish: "Quebec", nameFrench: "Québec", area: 1508203 },
    { nameEnglish: "Ontario", nameFrench: "Ontario", area: 980252 },
    { nameEnglish: "Manitoba", nameFrench: "Manitoba", area: 649627 },
    {
      nameEnglish: "Saskatchewan",
      nameFrench: "Saskatchewan",
      area: 652741,
    },
    { nameEnglish: "Alberta", nameFrench: "Alberta", area: 663024 },
    {
      nameEnglish: "British Columbia",
      nameFrench: "Colombie-Britannique",
      area: 938271,
    },
    { nameEnglish: "Yukon", nameFrench: "Yukon", area: 483592 },
    {
      nameEnglish: "Northwest Territories",
      nameFrench: "Territoires du Nord-Ouest",
      area: 1347423,
    },
    { nameEnglish: "Nunavut", nameFrench: "Nunavut", area: 2090913 },
  ]);

  await sdb.close();
});

Deno.test("should round areas after converting their unit", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table.area("area", { unit: "km2", decimals: 2 });
  table.selectColumns("area");

  assertEquals(await table.getData({ limit: 1 }), [{ area: 407428.31 }]);

  await sdb.close();
});
