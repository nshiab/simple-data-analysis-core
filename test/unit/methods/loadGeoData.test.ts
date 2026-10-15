import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test, expect } from "vite-plus/test";
import { ok as assert } from "node:assert/strict";
import { assertThrows, assertRejects } from "../../helpers/assertions.ts";
import { rm as nodeRm, mkdir as nodeMkdir, copyFile as nodeCopyFile } from "node:fs/promises";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";
import SDAError from "../../../src/class/SDAError.ts";

function spyOnQueries(table: SimpleTable): string[] {
  const queries: string[] = [];
  const original = table.runQuery;
  table.runQuery = (query, connection, returnData, options) => {
    queries.push(query);
    return original(query, connection, returnData, options);
  };
  return queries;
}

test("loadGeoData rejects OpenStreetMap files", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable();
    for (const file of [
      "extract.osm",
      "extract.OSM.PBF",
      "https://example.com/extract.osm?download=1",
    ]) {
      assertThrows(() => table.loadGeoData(file), Error, "Use loadOpenStreetMap() instead.");
    }
  } finally {
    await sdb.close();
  }
});

for (const { file, conditions } of [
  {
    file: "test/geodata/files/CanadianProvincesAndTerritories.json",
    conditions: "nameEnglish === 'Quebec' && nameFrench === 'Québec'",
  },
  {
    file: "test/geodata/files/CanadianProvincesAndTerritories/CanadianProvincesAndTerritories.shp",
    conditions: "nameEnglis = 'Quebec'",
  },
  {
    file: "test/geodata/files/CanadianProvincesAndTerritories.shp.zip",
    conditions: "nameEnglis = 'Quebec'",
  },
  {
    file: "test/geodata/files/data.geoparquet",
    conditions: "name = 'polygonB'",
  },
]) {
  test(`loadGeoData applies conditions before projection: ${file}`, async () => {
    const sdb = new SimpleDB();
    try {
      const table = sdb.newTable();
      const queries = spyOnQueries(table);
      table.loadGeoData(file, { conditions, columns: ["geom"] });
      expect(await table.getRowCount()).toStrictEqual(1);
      expect(await table.getColumns()).toStrictEqual(["geom"]);
      const writes = queries.filter((query) => query.includes("CREATE OR REPLACE TABLE"));
      expect(writes.length).toStrictEqual(1);
      expect(writes[0]).toContain("WHERE");
    } finally {
      await sdb.close();
    }
  });
}

test("loadGeoData captures conditions and handles empty, unmatched, and invalid conditions", async () => {
  const sdb = new SimpleDB();
  try {
    const file = "test/geodata/files/pointsInside.json";
    const options = { conditions: "name = 'pointB'", columns: ["name"] };
    const captured = sdb.newTable().loadGeoData(file, options);
    options.conditions = "FALSE";
    expect(await captured.getData()).toStrictEqual([{ name: "pointB" }]);
    for (const conditions of [undefined, "", "FALSE"]) {
      const table = sdb.newTable().loadGeoData(file, { conditions });
      expect(await table.getRowCount()).toStrictEqual(conditions === "FALSE" ? 0 : 4);
      expect(await table.getColumns()).toStrictEqual(["name", "geom"]);
    }
    for (const conditions of ["missing_column > 1", "name ="]) {
      const table = sdb.newTable().loadGeoData(file, { conditions });
      const error = await assertRejects(() => table.getData(), SDAError);
      expect(error.method).toStrictEqual("loadGeoData()");
      expect(error.parameters).toStrictEqual({ file, options: { conditions } });
    }
  } finally {
    await sdb.close();
  }
});

test("loadGeoData applies geometry conditions before reprojection", async () => {
  const sdb = new SimpleDB();
  const temporaryDirectory = await mkdtemp(join(tmpdir(), "sda-fixture-"));
  const file = join(temporaryDirectory, "fixture.geoparquet");
  try {
    await sdb.customQuery(`
      INSTALL spatial; LOAD spatial; SET geometry_always_xy = true;
      COPY (
        SELECT ST_Point(x, 2000000)::GEOMETRY('EPSG:3857') AS geom
        FROM (VALUES (0), (1000000)) AS points(x)
      ) TO '${file}' (FORMAT PARQUET)
    `);
    const table = sdb.newTable().loadGeoData(file, {
      conditions: "ST_X(geom) > 1000",
      toEPSG4326: true,
    });
    expect(await table.getRowCount()).toStrictEqual(1);
    expect(await table.getProjection("geom")).toStrictEqual("GEOMETRY('EPSG:4326')");
    expect(await table.filter("ST_X(geom) < 180").getRowCount()).toStrictEqual(1);
  } finally {
    await sdb.close();
    await nodeRm(temporaryDirectory, { recursive: true });
  }
});

test("loadGeoData tracks table dependencies in conditions for cache invalidation", async () => {
  const sdb = new SimpleDB();
  try {
    const source = sdb.newTable("geoLoadConditionsSource");
    const output = sdb.newTable("geoLoadConditionsOutput");
    source.loadArray([{ name: "pointA" }, { name: "pointB" }]);
    let runs = 0;
    const compute = () => {
      runs++;
      output.loadGeoData("test/geodata/files/pointsInside.json", {
        conditions: `name IN (SELECT name FROM "${source.name}")`,
        columns: ["name"],
      });
    };
    await output.cache(compute);
    await output.cache(compute);
    expect(runs).toStrictEqual(1);
    source.filter("name = 'pointB'");
    await output.cache(compute);
    expect(runs).toStrictEqual(2);
    expect(await output.getData()).toStrictEqual([{ name: "pointB" }]);
  } finally {
    await sdb.close();
  }
});

test("should escape geospatial file paths containing apostrophes", async () => {
  await nodeMkdir("test/output", { recursive: true });
  const file = "test/output/point's.json";
  await nodeCopyFile("test/geodata/files/point.json", file);

  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(file);

  expect((await table.getTypes()).geom).toStrictEqual("GEOMETRY('EPSG:4326')");
  await sdb.close();
});

test("should load a geojson file and return the table", async () => {
  const sdb = new SimpleDB();
  const table = sdb
    .newTable()
    .loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");

  expect(table instanceof SimpleTable).toStrictEqual(true);
  await table.run();
  await sdb.close();
});

test("should load a geojson file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");

  const types = await table.getTypes();

  expect(types).toStrictEqual({
    nameEnglish: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

test("should project selected GeoJSON columns while loading", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectedGeoJSON");
  const queries = spyOnQueries(table);
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json", {
    columns: ["nameEnglish", "geom"],
  });

  expect(await table.getTypes()).toStrictEqual({
    nameEnglish: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  const loadQuery = queries.find((query) => query.includes("ST_Read"));
  assert(loadQuery !== undefined);
  expect(loadQuery).toContain('AS SELECT "nameEnglish", "geom" FROM ST_Read');
  await sdb.close();
});

test.skipIf(process.env.CI === "true")("should load a geojson file from a URL", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const types = await table.getTypes();

  expect(types).toStrictEqual({
    nameEnglish: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

test("should load a shapefile file (not zipped)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories/CanadianProvincesAndTerritories.shp",
  );

  const types = await table.getTypes();

  expect(types).toStrictEqual({
    nameEnglis: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

test("should load a shapefile file (zipped)", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.shp.zip");

  const types = await table.getTypes();

  expect(types).toStrictEqual({
    nameEnglis: "VARCHAR",
    nameFrench: "VARCHAR",
    geom: "GEOMETRY('EPSG:4326')",
  });
  await sdb.close();
});

test("should load a GeoJSON file in EPSG:4326", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/point.json");
  table.extractLatLon("geom", "lat", "lon");
  table.selectColumns(["lat", "lon"]);

  const data = await table.getData();

  expect(data).toStrictEqual([{ lat: 45.51412791316409, lon: -73.62315106245389 }]);
  await sdb.close();
});

test("should load a geoparquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable().loadGeoData("test/geodata/files/data.geoparquet");

  expect(await table.getGeoData()).toStrictEqual({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [50.3447571, -80.5925744],
              [44.963885, -81.4683036],
              [46.9689849, -75.0907732],
              [50.1474736, -75.5601513],
              [50.3447571, -80.5925744],
            ],
          ],
        },
        properties: { name: "polygonA" },
      },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [62.0110577, -121.9581024],
              [56.0464801, -122.3017867],
              [51.5685044, -112.2459009],
              [51.4335657, -104.838484],
              [53.4420801, -96.8420125],
              [62.4259071, -98.0491012],
              [62.0110577, -121.9581024],
            ],
          ],
        },
        properties: { name: "polygonB" },
      },
    ],
  });
  await sdb.close();
});
test("should load a compressed geoparquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable().loadGeoData("test/geodata/files/data-compressed.geoparquet");

  expect(await table.getGeoData()).toStrictEqual({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [50.3447571, -80.5925744],
              [44.963885, -81.4683036],
              [46.9689849, -75.0907732],
              [50.1474736, -75.5601513],
              [50.3447571, -80.5925744],
            ],
          ],
        },
        properties: { name: "polygonA" },
      },
      {
        type: "Feature",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [62.0110577, -121.9581024],
              [56.0464801, -122.3017867],
              [51.5685044, -112.2459009],
              [51.4335657, -104.838484],
              [53.4420801, -96.8420125],
              [62.4259071, -98.0491012],
              [62.0110577, -121.9581024],
            ],
          ],
        },
        properties: { name: "polygonB" },
      },
    ],
  });
  await sdb.close();
});

test("should load a geoparquet file with multiple columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable().loadGeoData("test/geodata/files/data-multiple-columns.geoparquet");

  expect(await table.getTypes()).toStrictEqual({
    name: "VARCHAR",
    geom: "GEOMETRY('OGC:CRS84')",
    anotherGeom: "GEOMETRY('OGC:CRS84')",
  });
  await sdb.close();
});

test("should project selected GeoParquet columns while loading", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("selectedGeoParquet");
  const queries = spyOnQueries(table);
  table.loadGeoData("test/geodata/files/data-multiple-columns.geoparquet", {
    columns: ["name", "anotherGeom"],
  });

  expect(await table.getTypes()).toStrictEqual({
    name: "VARCHAR",
    anotherGeom: "GEOMETRY('OGC:CRS84')",
  });
  const loadQuery = queries.find((query) => query.includes("read_parquet"));
  assert(loadQuery !== undefined);
  expect(loadQuery).toContain('AS SELECT "name", "anotherGeom" FROM read_parquet');
  await sdb.close();
});

test("should skip reprojection when the data is already in EPSG:4326", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/pointsInside.json", {
    toEPSG4326: true,
  });

  const projection = await table.getProjection("geom");
  expect(projection).toStrictEqual("GEOMETRY('EPSG:4326')");

  const withoutOption = sdb.newTable("geodataWithout");
  withoutOption.loadGeoData("test/geodata/files/pointsInside.json");

  expect(await table.getGeoData()).toStrictEqual(await withoutOption.getGeoData());

  await sdb.close();
});
