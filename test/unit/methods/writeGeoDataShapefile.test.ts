import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

const output = "./test/output/";

Deno.test("should write a shapefile", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const originalFile = "test/geodata/files/polygons.geojson";

  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  const shp = `${output}/shapefile/data.shp`;
  await table.writeGeoData(shp);

  // To verify, we load it back
  const tableBack = sdb.newTable();
  tableBack.loadGeoData(shp);

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

  await sdb.close();
});

Deno.test("should overwrite every file in a shapefile dataset", async () => {
  const directory = await Deno.makeTempDir({
    prefix: "sda-write-shapefile-",
  });
  const sdb = new SimpleDB({ dataTransport: "file" });

  try {
    const table = sdb.newTable();
    table.loadGeoData("test/geodata/files/polygons.geojson");
    const shp = `${directory}/data.shp`;

    await table.writeGeoData(shp);
    table.selectRows(1);
    await table.writeGeoData(shp);

    const files = [];
    for await (const entry of Deno.readDir(directory)) {
      files.push(entry.name);
    }
    assertEquals(
      files.filter((file) => file.startsWith("tmp_data.")),
      [],
    );

    const writtenTable = sdb.newTable();
    writtenTable.loadGeoData(shp);
    const writtenData = await writtenTable.getGeoData() as {
      features: unknown[];
    };
    assertEquals(writtenData.features.length, 1);
  } finally {
    await sdb.close();
    await Deno.remove(directory, { recursive: true });
  }
});

Deno.test("should throw error for incompatible options with shapefiles", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/polygons.geojson");
  const shp = `${output}/shapefile/errors.shp`;

  await assertRejects(() => table.writeGeoData(shp, { precision: 3 }));
  await assertRejects(() => table.writeGeoData(shp, { compression: true }));
  await assertRejects(() => table.writeGeoData(shp, { rewind: true }));
  await assertRejects(() =>
    table.writeGeoData(shp, { metadata: { foo: "bar" } })
  );
  await assertRejects(() => table.writeGeoData(shp, { formatDates: true }));

  await sdb.close();
});
