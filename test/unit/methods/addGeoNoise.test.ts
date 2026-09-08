import { assert, assertEquals, assertRejects, assertThrows } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("addGeoNoise should move EPSG:4326 points within the requested distance", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("points");
  table.loadArray([
    { id: "equator", latitude: 0, longitude: 0 },
    { id: "montreal", latitude: 45.5, longitude: -73.6 },
    { id: "antimeridian", latitude: 80, longitude: 179.999 },
  ]);
  table.createPoints("latitude", "longitude", "geom");
  table.cloneColumn("geom", "originalGeom");

  table.addGeoNoise(10, { column: "geom", unit: "km" });
  await table.run();

  const data = await sdb.customQuery(
    `SELECT id,
      ST_Distance_Sphere(originalGeom, geom) AS distance,
      ST_X(geom) AS longitude,
      ST_Y(geom) AS latitude
    FROM points`,
    { returnData: true },
  ) as {
    id: string;
    distance: number;
    longitude: number;
    latitude: number;
  }[];
  for (const row of data) {
    assert(row.distance > 0);
    assert(row.distance <= 10_000.001);
    assert(row.longitude >= -180 && row.longitude <= 180);
    assert(row.latitude >= -90 && row.latitude <= 90);
  }
  assertEquals((await table.getTypes()).geom, "GEOMETRY('EPSG:4326')");

  await sdb.close();
});

Deno.test("addGeoNoise should move only duplicated points", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("points");
  table.loadArray([
    { id: "duplicate-a", latitude: 45.5, longitude: -73.6 },
    { id: "duplicate-b", latitude: 45.5, longitude: -73.6 },
    { id: "unique", latitude: 49.3, longitude: -123.1 },
  ]);
  table.createPoints("latitude", "longitude", "geom");
  table.cloneColumn("geom", "originalGeom");

  table.addGeoNoise(100, { column: "geom", onlyDuplicates: true });
  await table.run();

  const data = await sdb.customQuery(
    `SELECT id, ST_Distance_Sphere(originalGeom, geom) AS distance
    FROM points`,
    { returnData: true },
  ) as { id: string; distance: number }[];
  for (const row of data) {
    if (row.id === "unique") {
      assertEquals(row.distance, 0);
    } else {
      assert(row.distance > 0);
      assert(row.distance <= 100.001);
    }
  }

  await sdb.close();
});

Deno.test("addGeoNoise should reject non-point geometries", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/polygon.json");

  await assertRejects(
    () => table.addGeoNoise(100).run(),
    Error,
    "addGeoNoise() requires POINT geometries",
  );

  await sdb.close();
});

Deno.test("addGeoNoise should reject geometry columns outside EPSG:4326", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([{ latitude: 1, longitude: 2 }]);
  table.createPoints("latitude", "longitude", "geom", {
    projection: "EPSG:3347",
  });

  await assertRejects(
    () => table.addGeoNoise(100).run(),
    Error,
    "addGeoNoise() requires an EPSG:4326 geometry column",
  );

  await sdb.close();
});

Deno.test("addGeoNoise should validate maxDistance", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  assertThrows(
    () => table.addGeoNoise(-1),
    Error,
    "addGeoNoise() maxDistance must be a finite number greater than or equal to 0.",
  );
  assertThrows(
    () => table.addGeoNoise(20_016, { unit: "km" }),
    Error,
    "addGeoNoise() maxDistance cannot exceed half the Earth's circumference.",
  );

  await sdb.close();
});
