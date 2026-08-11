import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("direct transport remains the default and converts values", async () => {
  const sdb = new SimpleDB();
  assertEquals(sdb.dataTransport, "direct");
  const table = sdb.newTable("directValues");
  await sdb.customQuery(
    `CREATE TABLE "directValues" AS SELECT
      9007199254740993::BIGINT AS unsafe,
      123.450::DECIMAL(18,3) AS decimal,
      DATE '2020-01-15' AS observed,
      [4::BIGINT, 5::BIGINT] AS nested`,
  );

  assertEquals(await table.getData(), [{
    unsafe: 9007199254740992,
    decimal: "123.450",
    observed: new Date("2020-01-15T00:00:00.000Z"),
    nested: ["4", "5"],
  }]);
  await sdb.done();
});

Deno.test("direct transport returns GeoJSON", async () => {
  const sdb = new SimpleDB({ dataTransport: "direct" });
  const table = sdb.newTable("directGeo");
  table.loadGeoData("test/geodata/files/polygons.geojson");

  const geoData = await table.getGeoData();
  assertEquals(geoData.type, "FeatureCollection");
  assertEquals(geoData.features.length, 2);
  await sdb.done();
});
