import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should log the projections of the table, even if there is none", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");

  await table.logProjections();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log the projections of the table (Lambert conformal conic)", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/canada-not-4326.shp.zip");

  await table.logProjections();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log the projections of the table (Lambert conformal conic converted to EPSG:4326)", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/canada-not-4326.shp.zip", {
    toEPSG4326: true,
  });

  await table.logProjections();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log the projections of the table (GeoJSON EPSG:4326)", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  await table.logProjections();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
