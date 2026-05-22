import { assertEquals, assertNotEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should generate a random point in geometries and they should be random", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  // We repeat each row 10 times to check if the random points are different for each copy.
  await sdb.customQuery(
    `ALTER TABLE ${table.name} ADD COLUMN nbIterations INTEGER DEFAULT 10`,
  );
  await sdb.customQuery(`UPDATE ${table.name} SET nbIterations = 10`);
  await table.repeatRows("nbIterations");

  // We generate random points.
  await table.randomPoint("randomPoint", 100);

  // We extract lat and lon.
  await table.latLon("randomPoint", "lat", "lon");

  const lats = await table.getValues("lat") as number[];
  const lons = await table.getValues("lon") as number[];
  const names = await table.getValues("nameEnglish") as string[];

  // If there are 13 provinces and we repeated 10 times, we should have 130 rows.
  assertEquals(lats.length, 130);

  // For each province, we check if the 10 points are different.
  const provincePoints: { [key: string]: string[] } = {};
  for (let i = 0; i < lats.length; i++) {
    const name = names[i];
    const point = `${lats[i]},${lons[i]}`;
    if (!provincePoints[name]) {
      provincePoints[name] = [];
    }
    provincePoints[name].push(point);
  }

  for (const name in provincePoints) {
    const points = provincePoints[name];
    const uniquePoints = new Set(points);
    // If they are random, we should have multiple unique points.
    // Given 10 iterations, it's highly unlikely to get the same point twice if it's truly random.
    assertNotEquals(
      uniquePoints.size,
      1,
      `Points for ${name} are not random! All ${points.length} points are ${
        points[0]
      }`,
    );
  }

  await sdb.done();
});
