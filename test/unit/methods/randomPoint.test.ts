import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should generate a random point in geometries", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  // We can't easily test randomness, but we can test that the column is created and has points.
  await table.randomPoint("randomPoint", 100);

  const data = await table.getValues("randomPoint");

  // Check if points are inside the original geometry
  await table.inside("randomPoint", "geom", "isInside");
  const isInside = await table.getValues("isInside");

  // Check if we have 13 points (for 13 provinces/territories)
  assertEquals(data.length, 13);

  // Check that all values are not null and inside
  for (let i = 0; i < data.length; i++) {
    assertEquals(typeof data[i], "string");
    assertEquals(isInside[i], true);
  }

  await sdb.done();
});
