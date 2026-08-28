import { assertEquals, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should list available samples for an unknown sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () => table.loadSample("unknown" as "fires"),
    Error,
    `loadSample() does not recognize sample "unknown". Available samples: "fires", "recipes", "temperatures", "temperaturesCities", "canada", "firesGeo".`,
  );

  await sdb.close();
});

Deno.test("should load the fires sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("fires");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/geodata/files/firesCanada2023.csv");
  const dataLocal = await tableLocal.getData();

  assertEquals(data, dataLocal);
  await sdb.close();
});

Deno.test("should load the recipes sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("recipes");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/data/files/recipes.parquet");
  const dataLocal = await tableLocal.getData();

  assertEquals(data, dataLocal);
  await sdb.close();
});

Deno.test("should load the temperatures sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("temperatures");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/data/files/dailyTemperatures.csv");
  const dataLocal = await tableLocal.getData();

  assertEquals(data, dataLocal);
  await sdb.close();
});

Deno.test("should load the temperaturesCities sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("temperaturesCities");
  const data = await table.getData();

  const tableLocal = sdb.newTable();
  tableLocal.loadData("test/data/files/cities.csv");
  const dataLocal = await tableLocal.getData();

  assertEquals(data, dataLocal);
  await sdb.close();
});

Deno.test("should load the canada sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("canada");
  const data = await table.getGeoData();

  const tableLocal = sdb.newTable();
  tableLocal.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  const dataLocal = await tableLocal.getGeoData();

  assertEquals(data, dataLocal);
  await sdb.close();
});

Deno.test("should load the firesGeo sample", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadSample("firesGeo");
  const data = await table.getGeoData();

  const tableLocal = sdb.newTable();
  tableLocal.loadGeoData("test/geodata/files/firesCanada2023.geojson");
  const dataLocal = await tableLocal.getGeoData();

  assertEquals(data, dataLocal);
  await sdb.close();
});
