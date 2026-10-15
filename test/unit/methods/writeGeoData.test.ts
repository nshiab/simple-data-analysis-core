import { ok as assert } from "node:assert/strict";
import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";
import { mkdtemp as nodeMkdtemp, readdir as nodeReaddir, rm as nodeRm } from "node:fs/promises";
import { join as nodeJoin } from "node:path";
import { tmpdir as nodeTmpdir } from "node:os";
import { existsSync, readFileSync } from "node:fs";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import rewind from "../../../src/helpers/rewind.ts";

const output = "./test/output/";

test("should write a json file", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  await table.writeGeoData(`${output}data.json`);

  const originalData: unknown = JSON.parse(readFileSync(originalFile, "utf-8"));
  const writtenData: unknown = JSON.parse(readFileSync(`${output}data.json`, "utf-8"));

  expect(writtenData).toStrictEqual(originalData);
  await sdb.close();
});
test("should write a json file with metadata", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  await table.writeGeoData(`${output}data.json`, {
    metadata: { key: "value" },
  });

  const originalData: unknown = JSON.parse(readFileSync(originalFile, "utf-8"));
  assert(originalData !== null && typeof originalData === "object");
  Object.assign(originalData, { metadata: { key: "value" } });
  const writtenData: unknown = JSON.parse(readFileSync(`${output}data.json`, "utf-8"));

  expect(writtenData).toStrictEqual(originalData);
  await sdb.close();
});
test("should write a json file with dates properties", async () => {
  const sdb = new SimpleDB();

  const table = sdb.newTable();
  const originalData = [
    {
      time: new Date("2025-01-01T01:23:10.987Z"),
      lat: 1,
      lon: 2,
    },
  ];
  table.loadArray(originalData);
  table.createPoints("lat", "lon", "geom");
  await table.writeGeoData(`${output}geodata-dates.json`, {
    formatDates: true,
  });

  const writtenData: unknown = JSON.parse(readFileSync(`${output}geodata-dates.json`, "utf-8"));
  expect(writtenData).toStrictEqual({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          time: "2025-01-01T01:23:10.987Z",
          lat: 1.0,
          lon: 2.0,
        },
        geometry: { type: "Point", coordinates: [2.0, 1.0] },
      },
    ],
  });
  await sdb.close();
});
test("should write a json file with dates properties and keep the original table unchanged", async () => {
  const sdb = new SimpleDB();

  const table = sdb.newTable();
  const originalData = [
    {
      time: new Date("2025-01-01T01:23:10.987Z"),
      lat: 1,
      lon: 2,
    },
  ];
  table.loadArray(originalData);
  table.createPoints("lat", "lon", "geom");
  await table.writeGeoData(`${output}geodata-dates.json`, {
    formatDates: true,
  });
  table.selectColumns(["time", "lat", "lon"]);
  expect(await table.getData()).toStrictEqual(originalData);
  await sdb.close();
});

test("should write a geojson file", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  await table.writeGeoData(`${output}data.geojson`);

  const originalData: unknown = JSON.parse(readFileSync(originalFile, "utf-8"));
  const writtenData: unknown = JSON.parse(readFileSync(`${output}data.geojson`, "utf-8"));

  expect(writtenData).toStrictEqual(originalData);
  await sdb.close();
});

test("should write a geojson file and create the path if it doesn't exist", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  await table.writeGeoData(`${output}/subfolderGeoData/data.geojson`);

  const originalData: unknown = JSON.parse(readFileSync(originalFile, "utf-8"));
  const writtenData: unknown = JSON.parse(
    readFileSync(`${output}subfolderGeoData/data.geojson`, "utf-8"),
  );

  expect(writtenData).toStrictEqual(originalData);
  await sdb.close();
});

test("should write a GeoJSON file that has been converted to EPSG:4326", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/canada-not-4326.shp.zip";

  const table = sdb.newTable();
  table.loadGeoData(originalFile, { toEPSG4326: true });
  await table.writeGeoData(`${output}dataWithOptionsToEPSG4326.geojson`, {
    precision: 2,
  });
  const writtenData: unknown = JSON.parse(
    readFileSync(`${output}dataWithOptionsToEPSG4326.geojson`, "utf-8"),
  );

  const canada: unknown = JSON.parse(readFileSync("test/geodata/files/canada.json", "utf-8"));

  expect(writtenData).toStrictEqual(canada);
  await sdb.close();
});

test("should write a GeoJSON file that has been manually converted to EPSG:4326", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/canada-not-4326.shp.zip";

  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  table.reproject("EPSG:4326");
  await table.writeGeoData(`${output}dataWithOptionsToEPSG4326.geojson`, {
    precision: 2,
  });

  const writtenData: unknown = JSON.parse(
    readFileSync(`${output}dataWithOptionsToEPSG4326.geojson`, "utf-8"),
  );

  const canada: unknown = JSON.parse(readFileSync("test/geodata/files/canada.json", "utf-8"));

  expect(writtenData).toStrictEqual(canada);
  await sdb.close();
});

test("should write geojson file with coordinates rounded to 3 decimals", async () => {
  const originalFile = "test/geodata/files/polygons.geojson";

  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  await table.writeGeoData(`${output}dataPrecision.geojson`, {
    precision: 3,
  });

  const writtenData: unknown = JSON.parse(readFileSync(`${output}dataPrecision.geojson`, "utf-8"));

  expect(writtenData).toStrictEqual({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "polygonA" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-80.593, 50.345],
              [-81.468, 44.964],
              [-75.091, 46.969],
              [-75.56, 50.147],
              [-80.593, 50.345],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { name: "polygonB" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-121.958, 62.011],
              [-122.302, 56.046],
              [-112.246, 51.569],
              [-104.838, 51.434],
              [-96.842, 53.442],
              [-98.049, 62.426],
              [-121.958, 62.011],
            ],
          ],
        },
      },
    ],
  });

  await sdb.close();
});
test("should write a geojson without rewinding the file", async () => {
  const sdb = new SimpleDB();

  const data = sdb.newTable();
  data.loadGeoData("test/geodata/files/economicRegions-simplified.json");
  await data.writeGeoData(`${output}no-rewind-data.geojson`);

  const writtenData: unknown = JSON.parse(readFileSync(`${output}no-rewind-data.geojson`, "utf-8"));
  const originalData: unknown = JSON.parse(
    readFileSync("test/geodata/files/economicRegions-simplified.json", "utf-8"),
  );

  expect(writtenData).toStrictEqual(originalData);
});
test("should write a geojson and rewind the file", async () => {
  const sdb = new SimpleDB();

  const data = sdb.newTable();
  data.loadGeoData("test/geodata/files/economicRegions-simplified.json");
  await data.writeGeoData(`${output}rewind-data.geojson`, { rewind: true });

  const writtenData: unknown = JSON.parse(readFileSync(`${output}rewind-data.geojson`, "utf-8"));
  const rewindedData: unknown = rewind(
    JSON.parse(readFileSync("test/geodata/files/economicRegions-simplified.json", "utf-8")),
  );

  expect(writtenData).toStrictEqual(rewindedData);
});
test("should write a geoparquet file", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const originalData = sdb.newTable();
  originalData.loadGeoData(originalFile);
  await originalData.writeGeoData(`${output}data.geoparquet`);

  const writtenData = sdb.newTable();
  writtenData.loadGeoData(`${output}data.geoparquet`);

  expect(await writtenData.getGeoData()).toStrictEqual(await originalData.getGeoData());
  expect(
    await sdb.customQuery(
      `SELECT DISTINCT compression FROM parquet_metadata('${output}data.geoparquet')`,
      { returnData: true },
    ),
  ).toStrictEqual([{ compression: "SNAPPY" }]);
  await sdb.close();
});

test("should write a compressed geoparquet file", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const originalData = sdb.newTable();
  originalData.loadGeoData(originalFile);
  await originalData.writeGeoData(`${output}data-compressed.geoparquet`, {
    compression: true,
  });

  const writtenData = sdb.newTable();
  writtenData.loadGeoData(`${output}data-compressed.geoparquet`);

  expect(await writtenData.getGeoData()).toStrictEqual(await originalData.getGeoData());
  expect(
    await sdb.customQuery(
      `SELECT DISTINCT compression FROM parquet_metadata('${output}data-compressed.geoparquet')`,
      { returnData: true },
    ),
  ).toStrictEqual([{ compression: "ZSTD" }]);
  await sdb.close();
});

test("should write a geoparquet file with multiple geo columns", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const originalData = sdb.newTable();
  originalData.loadGeoData(originalFile);
  originalData.cloneColumn("geom", "anotherGeom");
  const originalColumns = await originalData.getColumns();
  const originalNbRows = await originalData.getRowCount();
  await originalData.writeGeoData(`${output}data-multiple-columns.geoparquet`);

  const writtenData = sdb.newTable();
  writtenData.loadGeoData(`${output}data-multiple-columns.geoparquet`);
  const writtenColumns = await writtenData.getColumns();
  const writtenNbRows = await writtenData.getRowCount();

  expect(writtenColumns).toStrictEqual(originalColumns);
  expect(writtenNbRows).toStrictEqual(originalNbRows);
  await sdb.close();
});

test("should write a shapefile", async () => {
  const sdb = new SimpleDB();
  const originalFile = "test/geodata/files/polygons.geojson";

  const table = sdb.newTable();
  table.loadGeoData(originalFile);
  const shp = `${output}/shapefile/data.shp`;
  await table.writeGeoData(shp);

  const tableBack = sdb.newTable();
  tableBack.loadGeoData(shp);

  const originalData = await table.getGeoData();
  const writtenData = await tableBack.getGeoData();

  // Shapefiles might have different property names, precision, or winding order, but geometry type and feature count should match
  const writtenFeatures = (writtenData as { features: { geometry: { type: string } }[] }).features;
  const originalFeatures = (originalData as { features: { geometry: { type: string } }[] })
    .features;
  expect(writtenFeatures.length).toStrictEqual(originalFeatures.length);
  expect(writtenFeatures[0].geometry.type).toStrictEqual(originalFeatures[0].geometry.type);

  await sdb.close();
});

test("should overwrite every file in a shapefile dataset", async () => {
  const directory = await nodeMkdtemp(nodeJoin(nodeTmpdir(), "sda-write-shapefile-"));
  const sdb = new SimpleDB();

  try {
    const table = sdb.newTable();
    table.loadGeoData("test/geodata/files/polygons.geojson");
    const shp = `${directory}/data.shp`;

    await table.writeGeoData(shp);
    table.selectRows(1);
    await table.writeGeoData(shp);

    const files = [];
    for (const entry of await nodeReaddir(directory, { withFileTypes: true })) {
      files.push(entry.name);
    }
    expect(files.filter((file) => file.startsWith("tmp_data."))).toStrictEqual([]);

    const writtenTable = sdb.newTable();
    writtenTable.loadGeoData(shp);
    const writtenData = (await writtenTable.getGeoData()) as {
      features: unknown[];
    };
    expect(writtenData.features.length).toStrictEqual(1);
  } finally {
    await sdb.close();
    await nodeRm(directory, { recursive: true });
  }
});

test("should write a compressed .shp.zip file", async () => {
  const directory = await nodeMkdtemp(nodeJoin(nodeTmpdir(), "sda-infer-compressed-shapefile-"));
  const sdb = new SimpleDB();

  try {
    const table = sdb.newTable();
    table.loadGeoData("test/geodata/files/polygons.geojson");
    const archive = `${directory}/data.shp.zip`;

    await table.writeGeoData(archive);

    expect(existsSync(archive)).toStrictEqual(true);
    expect(existsSync(`${archive}.zip`)).toStrictEqual(false);
    expect(readFileSync(archive)[8]).toStrictEqual(8);
    const files = [];
    for (const entry of await nodeReaddir(directory, { withFileTypes: true })) {
      files.push(entry.name);
    }
    expect(files).toStrictEqual(["data.shp.zip"]);

    const writtenTable = sdb.newTable();
    writtenTable.loadGeoData(archive);
    expect(await writtenTable.getRowCount()).toStrictEqual(await table.getRowCount());
  } finally {
    await sdb.close();
    await nodeRm(directory, { recursive: true });
  }
});

test("should overwrite a compressed shapefile", async () => {
  const directory = await nodeMkdtemp(
    nodeJoin(nodeTmpdir(), "sda-overwrite-compressed-shapefile-"),
  );
  const sdb = new SimpleDB();

  try {
    const table = sdb.newTable();
    table.loadGeoData("test/geodata/files/polygons.geojson");
    const archive = `${directory}/data.shp.zip`;

    await table.writeGeoData(archive);
    table.selectRows(1);
    await table.writeGeoData(archive);

    const writtenTable = sdb.newTable();
    writtenTable.loadGeoData(archive);
    expect(await writtenTable.getRowCount()).toStrictEqual(1);

    const files = [];
    for (const entry of await nodeReaddir(directory, { withFileTypes: true })) {
      files.push(entry.name);
    }
    expect(files).toStrictEqual(["data.shp.zip"]);
  } finally {
    await sdb.close();
    await nodeRm(directory, { recursive: true });
  }
});

test("should throw error for incompatible options with shapefiles", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/polygons.geojson");
  const shp = `${output}/shapefile/errors.shp`;

  await assertRejects(() => table.writeGeoData(shp, { precision: 3 }));
  await assertRejects(
    () => table.writeGeoData(shp, { compression: true }),
    Error,
    "compression is not supported for Shapefiles",
  );
  await assertRejects(
    () => table.writeGeoData(`${shp}.zip`, { compression: false }),
    Error,
    "compression is not supported for Shapefiles",
  );
  await assertRejects(() => table.writeGeoData(shp, { rewind: true }));
  await assertRejects(() => table.writeGeoData(shp, { metadata: { foo: "bar" } }));
  await assertRejects(() => table.writeGeoData(shp, { formatDates: true }));

  await sdb.close();
});

test("writeGeoData should throw an error when there is no geometry column and suggest using writeData", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");

  await assertRejects(
    async () => {
      await table.writeGeoData("${output}test.geojson");
    },
    Error,
    "Table contains no geometry columns. Use writeData() instead.",
  );

  await sdb.close();
});
