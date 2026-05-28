import { assertEquals, assertNotEquals, assertRejects } from "@std/assert";
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

  const types = await table.getTypes();
  assertEquals(types.randomPoint, "GEOMETRY('EPSG:4326')");

  await sdb.done();
});

Deno.test("randomPoint should throw an error if no point is found", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  // With 0 tries, no point should be found.
  await assertRejects(
    async () => {
      await table.randomPoint("randomPoint", 0);
    },
    Error,
    "13 points could not be generated. Consider increasing nbPointsToTry or set options.try to true.",
  );

  await sdb.done();
});

Deno.test("randomPoint should not throw an error if no point is found and options.try is true", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  // With 0 tries, no point should be found.
  await table.randomPoint("randomPoint", 0, { try: true });

  const nbNulls = await table.getNbRows({
    conditions: '"randomPoint" IS NULL',
  });
  assertEquals(nbNulls, 13);

  await sdb.done();
});

Deno.test("randomPoint should throw an error if nbPointsToTry is less than 0", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  await assertRejects(
    async () => {
      // @ts-ignore trying invalid value
      await table.randomPoint("randomPoint", -1);
    },
    Error,
    "nbPointsToTry must be a number greater than or equal to 0",
  );

  await sdb.done();
});

Deno.test("randomPoint should have similar performance with many more tries if it exits early", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  await table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const start10 = Date.now();
  await table.randomPoint("point10", 10, { column: "geom", try: true });
  const duration10 = Date.now() - start10;

  const start10k = Date.now();
  await table.randomPoint("point10k", 10_000, { column: "geom", try: true });
  const duration10k = Date.now() - start10k;

  const start100k = Date.now();
  await table.randomPoint("point100k", 100_000, { column: "geom", try: true });
  const duration100k = Date.now() - start100k;

  console.log({ duration10, duration10k, duration100k });

  // For 13 provinces, finding one point is fast.
  // DuckDB doesn't always short-circuit range() in LATERAL joins with a WHERE clause,
  // so the duration might scale more linearly than expected with tries.
  assertEquals(
    duration100k < 10000,
    true,
    `Performance issue: 100k tries took ${duration100k}ms.`,
  );

  await sdb.done();
});
