import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

const output = "./test/output/";

Deno.test("should write a shapefile (zipped)", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const table = sdb.newTable();
  await table.loadGeoData(originalFile);
  const shp = `${output}data.shp`;
  await table.writeGeoData(shp);

  // To verify, we load it back
  const tableBack = sdb.newTable();
  await tableBack.loadGeoData(shp);

  const originalData = await table.getGeoData();
  const writtenData = await tableBack.getGeoData();

  // Shapefiles might have different property names, precision, or winding order, but geometry type and feature count should match
  const writtenFeatures =
    (writtenData as { features: { geometry: { type: string } }[] }).features;
  const originalFeatures =
    (originalData as { features: { geometry: { type: string } }[] }).features;
  assertEquals(
    writtenFeatures.length,
    originalFeatures.length,
  );
  assertEquals(
    writtenFeatures[0].geometry.type,
    originalFeatures[0].geometry.type,
  );

  await sdb.done();
});

Deno.test("should throw error for incompatible options with shapefiles", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadGeoData("test/geodata/files/polygons.geojson");
  const shp = `${output}errors.shp`;

  await assertRejects(() => table.writeGeoData(shp, { precision: 3 }));
  await assertRejects(() => table.writeGeoData(shp, { compression: true }));
  await assertRejects(() => table.writeGeoData(shp, { rewind: true }));
  await assertRejects(() =>
    table.writeGeoData(shp, { metadata: { foo: "bar" } })
  );
  await assertRejects(() => table.writeGeoData(shp, { formatDates: true }));

  await sdb.done();
});
