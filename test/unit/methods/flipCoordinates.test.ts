import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should flip the coordinates", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/point.json");
  table.flipCoordinates();

  const types = await table.getTypes();
  assertEquals(types.geom, "GEOMETRY('EPSG:4326')");

  const data = await sdb.customQuery(
    `SELECT ST_AsText(geom) as geomText FROM geoData;`,
    { returnData: true },
  );

  assertEquals(data, [
    { geomText: "POINT (45.51412791316409 -73.62315106245389)" },
  ]);
  await sdb.close();
});

Deno.test("should flip the coordinates from a specific column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geoData");
  table.loadGeoData("test/geodata/files/point.json");
  table.flipCoordinates("geom");
  const data = await sdb.customQuery(
    `SELECT ST_AsText(geom) as geomText FROM geoData;`,
    { returnData: true },
  );

  assertEquals(data, [
    { geomText: "POINT (45.51412791316409 -73.62315106245389)" },
  ]);
  await sdb.close();
});
