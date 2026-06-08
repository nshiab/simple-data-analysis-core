import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should create minLon, maxLon, minLat, maxLat columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  await table.boundingBox({ decimals: 3 });
  await table.removeColumns("geom");
  const data = await table.getData();

  // Ontario
  const ontario = data.find((d) => d.nameEnglish === "Ontario") as {
    [key: string]: number | string;
  };
  assertEquals(ontario.minLon, -95.153);
  assertEquals(ontario.maxLon, -74.343);
  assertEquals(ontario.minLat, 41.981);
  assertEquals(ontario.maxLat, 56.851);

  await sdb.done();
});

Deno.test("should create minLon, maxLon, minLat, maxLat columns for a specific column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  await table.boundingBox({ column: "geom", decimals: 1 });
  await table.removeColumns("geom");
  const data = await table.getData();

  // Ontario
  const ontario = data.find((d) => d.nameEnglish === "Ontario") as {
    [key: string]: number | string;
  };
  assertEquals(ontario.minLon, -95.2);
  assertEquals(ontario.maxLon, -74.3);
  assertEquals(ontario.minLat, 42);
  assertEquals(ontario.maxLat, 56.9);

  await sdb.done();
});
