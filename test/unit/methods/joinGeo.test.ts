import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should do a left spatial join the intersect method", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable();
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygons.geojson");

  prov.joinGeo(poly, "intersect");
  prov.selectColumns(["nameEnglish", "name"]);

  const data = await prov.getData();
  assertEquals(data, [
    { nameEnglish: "Quebec", name: "polygonA" },
    { nameEnglish: "Ontario", name: "polygonA" },
    { nameEnglish: "Manitoba", name: "polygonB" },
    { nameEnglish: "Saskatchewan", name: "polygonB" },
    { nameEnglish: "Alberta", name: "polygonB" },
    { nameEnglish: "British Columbia", name: "polygonB" },
    { nameEnglish: "Northwest Territories", name: "polygonB" },
    { nameEnglish: "Nunavut", name: "polygonB" },
    { nameEnglish: "Newfoundland and Labrador", name: null },
    { nameEnglish: "Prince Edward Island", name: null },
    { nameEnglish: "Nova Scotia", name: null },
    { nameEnglish: "New Brunswick", name: null },
    { nameEnglish: "Yukon", name: null },
  ]);
  await sdb.done();
});
Deno.test("should do a left spatial join the intersect method and output the results to a new table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable();
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygons.geojson");

  const table = prov.joinGeo(poly, "intersect", {
    outputTable: true,
  });
  table.selectColumns(["nameEnglish", "name"]);

  const data = await table.getData();
  assertEquals(data, [
    { nameEnglish: "Quebec", name: "polygonA" },
    { nameEnglish: "Ontario", name: "polygonA" },
    { nameEnglish: "Manitoba", name: "polygonB" },
    { nameEnglish: "Saskatchewan", name: "polygonB" },
    { nameEnglish: "Alberta", name: "polygonB" },
    { nameEnglish: "British Columbia", name: "polygonB" },
    { nameEnglish: "Northwest Territories", name: "polygonB" },
    { nameEnglish: "Nunavut", name: "polygonB" },
    { nameEnglish: "Newfoundland and Labrador", name: null },
    { nameEnglish: "Prince Edward Island", name: null },
    { nameEnglish: "Nova Scotia", name: null },
    { nameEnglish: "New Brunswick", name: null },
    { nameEnglish: "Yukon", name: null },
  ]);
  await sdb.done();
});
Deno.test("should do a left spatial join the intersect method and output the results to a new table with a specific name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable();
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygons.geojson");

  prov.joinGeo(poly, "intersect", {
    outputTable: "specificTable",
  });

  const data = await sdb.customQuery(
    "select nameEnglish, name from specificTable",
    { returnData: true },
  );

  assertEquals(data, [
    { nameEnglish: "Quebec", name: "polygonA" },
    { nameEnglish: "Ontario", name: "polygonA" },
    { nameEnglish: "Manitoba", name: "polygonB" },
    { nameEnglish: "Saskatchewan", name: "polygonB" },
    { nameEnglish: "Alberta", name: "polygonB" },
    { nameEnglish: "British Columbia", name: "polygonB" },
    { nameEnglish: "Northwest Territories", name: "polygonB" },
    { nameEnglish: "Nunavut", name: "polygonB" },
    { nameEnglish: "Newfoundland and Labrador", name: null },
    { nameEnglish: "Prince Edward Island", name: null },
    { nameEnglish: "Nova Scotia", name: null },
    { nameEnglish: "New Brunswick", name: null },
    { nameEnglish: "Yukon", name: null },
  ]);
  await sdb.done();
});
Deno.test("should do a left spatial join the intersect method with tables with default names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable();
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygons.geojson");

  prov.joinGeo(poly, "intersect");

  const columnsLeftTable = await prov.getColumns();

  assertEquals(columnsLeftTable, [
    "nameEnglish",
    "nameFrench",
    "geom",
    "name",
    "geomTable2",
  ]);
  await sdb.done();
});
Deno.test("should do a left spatial join the intersect method with tables with specific names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable("prov");
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  const poly = sdb.newTable("poly");
  poly.loadGeoData("test/geodata/files/polygons.geojson");

  prov.joinGeo(poly, "intersect");

  const columnsLeftTable = await prov.getColumns();

  assertEquals(columnsLeftTable, [
    "nameEnglish",
    "nameFrench",
    "geom",
    "name",
    "geomPoly",
  ]);
  await sdb.done();
});
Deno.test("should do a left spatial join the intersect method without changing the name of the original tables", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable();
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygons.geojson");

  prov.joinGeo(poly, "intersect");

  const columnsLeftTable = await prov.getColumns();
  const columnsRightTable = await poly.getColumns();

  assertEquals(
    { columnsLeftTable, columnsRightTable },
    {
      columnsLeftTable: [
        "nameEnglish",
        "nameFrench",
        "geom",
        "name",
        "geomTable2",
      ],
      columnsRightTable: ["name", "geom"],
    },
  );
  await sdb.done();
});
Deno.test("should do a left spatial join the intersect method without changing the name of the original tables with an outputTable option", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable();
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygons.geojson");

  prov.joinGeo(poly, "intersect", { outputTable: true });

  const columnsLeftTable = await prov.getColumns();
  const columnsRightTable = await poly.getColumns();

  assertEquals(
    { columnsLeftTable, columnsRightTable },
    {
      columnsLeftTable: ["nameEnglish", "nameFrench", "geom"],
      columnsRightTable: ["name", "geom"],
    },
  );
  await sdb.done();
});
Deno.test("should do a left spatial join the intersect method with specific options", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const prov = sdb.newTable();
  prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  prov.renameColumns({ geom: "geomProvince" });
  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygons.geojson");
  poly.renameColumns({ geom: "geomPolygon" });

  const joined = prov.joinGeo(poly, "intersect", {
    leftColumn: "geomProvince",
    rightColumn: "geomPolygon",
    type: "inner",
    outputTable: "joined",
  });
  joined.selectColumns(["nameEnglish", "name"]);

  const data = await joined.getData();

  assertEquals(data, [
    { nameEnglish: "Quebec", name: "polygonA" },
    { nameEnglish: "Ontario", name: "polygonA" },
    { nameEnglish: "Manitoba", name: "polygonB" },
    { nameEnglish: "Saskatchewan", name: "polygonB" },
    { nameEnglish: "Alberta", name: "polygonB" },
    { nameEnglish: "British Columbia", name: "polygonB" },
    { nameEnglish: "Northwest Territories", name: "polygonB" },
    { nameEnglish: "Nunavut", name: "polygonB" },
  ]);
  await sdb.done();
});
Deno.test("should do a left spatial join the inside method", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable();
  points.loadGeoData("test/geodata/files/pointsInside.json");

  const poly = sdb.newTable();
  poly.loadGeoData("test/geodata/files/polygonInside.json");
  poly.renameColumns({ name: "polygonName" });

  points.joinGeo(poly, "inside");
  points.selectColumns(["name", "polygonName"]);

  const data = await points.getData();

  assertEquals(data, [
    { name: "pointC", polygonName: "container" },
    { name: "pointD", polygonName: "container" },
    { name: "pointA", polygonName: null },
    { name: "pointB", polygonName: null },
  ]);
  await sdb.done();
});
Deno.test("should return all intersections and all rows from leftTable when doing a left join", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const polygonsWithin = sdb.newTable();
  polygonsWithin.loadGeoData(
    "test/geodata/files/polygonsWithinPolygons.json",
  );

  const polygonsWithinNotNull = polygonsWithin.cloneTable({
    conditions: `name NOT NULL`,
  });
  polygonsWithinNotNull.removeColumns("container");

  const containers = polygonsWithin.cloneTable({
    conditions: `container NOT NULL`,
  });
  containers.removeColumns("name");

  const joined = polygonsWithinNotNull.joinGeo(
    containers,
    "intersect",
    {
      outputTable: "joined",
    },
  );
  joined.selectColumns(["name", "container"]);
  joined.sort({ name: "asc" });
  const data = await joined.getData();

  assertEquals(data, [
    { name: "A", container: null },
    { name: "B", container: "A" },
    { name: "B", container: "B" },
    { name: "C", container: "A" },
    { name: "C", container: "B" },
    { name: "D", container: "A" },
  ]);
  await sdb.done();
});

Deno.test("should return all intersections - and just intersections - when doing an inner join", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const polygonsWithin = sdb.newTable();
  polygonsWithin.loadGeoData(
    "test/geodata/files/polygonsWithinPolygons.json",
  );

  const polygonsWithinNotNull = polygonsWithin.cloneTable({
    conditions: `name NOT NULL`,
  });
  polygonsWithinNotNull.removeColumns("container");

  const containers = polygonsWithin.cloneTable({
    conditions: `container NOT NULL`,
  });
  containers.removeColumns("name");

  const joined = polygonsWithinNotNull.joinGeo(
    containers,
    "intersect",
    {
      outputTable: "joined",
      type: "inner",
    },
  );
  joined.selectColumns(["name", "container"]);
  joined.sort({ name: "asc" });
  const data = await joined.getData();

  assertEquals(data, [
    { name: "B", container: "A" },
    { name: "B", container: "B" },
    { name: "C", container: "A" },
    { name: "C", container: "B" },
    { name: "D", container: "A" },
  ]);
  await sdb.done();
});

Deno.test("should return all points within a target distance (srs method)", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const cities = sdb.newTable();
  cities.loadGeoData("test/geodata/files/coordinates.geojson");
  const cloned = cities.cloneTable();
  cloned.renameColumns({ name: "name_1" });
  cities.joinGeo(cloned, "withinDistance", { distance: 10 });
  cities.distance("geom", "geomTable2", "dist", { decimals: 2 });
  cities.selectColumns(["name", "name_1", "dist"]);

  const data = await cities.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "toronto", name_1: "montreal", dist: 5.66 },
    { name: "montreal", name_1: "toronto", dist: 5.66 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);
  await sdb.done();
});

Deno.test("should return all points within a target distance (haversine method)", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const cities = sdb.newTable();
  cities.loadGeoData("test/geodata/files/coordinates.geojson");
  const cloned = cities.cloneTable();
  cloned.renameColumns({ name: "name_1" });

  cities.joinGeo(cloned, "withinDistance", {
    distance: 500_000,
    distanceMethod: "haversine",
    type: "inner",
  });
  cities.distance("geom", "geomTable2", "dist", {
    method: "haversine",
    decimals: 0,
  });
  cities.selectColumns(["name", "name_1", "dist"]);
  const data = await cities.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 464577 },
    { name: "toronto", name_1: "montreal", dist: 464577 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);
  await sdb.done();
});

Deno.test("should return all points within a target distance (spheroid method)", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const cities = sdb.newTable();
  cities.loadGeoData("test/geodata/files/coordinates.geojson");
  const cloned = cities.cloneTable();
  cloned.renameColumns({ name: "name_1" });

  cities.joinGeo(cloned, "withinDistance", {
    distance: 500_000,
    distanceMethod: "spheroid",
    type: "inner",
  });
  cities.distance("geom", "geomTable2", "dist", {
    method: "spheroid",
    decimals: 0,
  });
  cities.selectColumns(["name", "name_1", "dist"]);

  const data = await cities.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 465639 },
    { name: "toronto", name_1: "montreal", dist: 465639 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);
  await sdb.done();
});
Deno.test("should log a table after a joinGeo", async () => {
  // Example from Code Like a Journalist geospatial lesson

  const sdb = new SimpleDB({ dataTransport: "file" });

  const fires = sdb.newTable("fires");

  fires.loadData(
    "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/geodata/files/firesCanada2023.csv",
  );
  fires.points("lat", "lon", "geom");

  const provinces = sdb.newTable("provinces");
  provinces.loadGeoData(
    "https://raw.githubusercontent.com/nshiab/simple-data-analysis-core/main/test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const firesInsideProvinces = fires.joinGeo(provinces, "inside", {
    outputTable: "firesInsideProvinces",
  });
  // await firesInsideProvinces.logTable();

  await firesInsideProvinces.run();
  await sdb.done();
});
