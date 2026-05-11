import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should compute the intersection of geometries", async () => {
  const sdb = new SimpleDB();

  const prov = sdb.newTable("prov");
  await prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  await prov.renameColumns({ geom: "prov" });

  const poly = sdb.newTable("poly");
  await poly.loadGeoData("test/geodata/files/polygons.geojson");
  await poly.area("polArea");
  await poly.round("polArea");
  await poly.renameColumns({ geom: "pol" });

  const joined = await prov.crossJoin(poly, { outputTable: "joined" });
  await joined.intersection("pol", "prov", "intersec");
  await joined.area("intersecArea", { column: "intersec" });
  await joined.round("intersecArea");
  await joined.addColumn(
    "intersecPerc",
    "double",
    `ROUND(intersecArea/polArea, 4)`,
  );

  await joined.selectColumns(["nameEnglish", "name", "intersecPerc"]);
  const data = await joined.getData();

  assertEquals(data, [
    {
      nameEnglish: "Newfoundland and Labrador",
      name: "polygonA",
      intersecPerc: 0,
    },
    {
      nameEnglish: "Prince Edward Island",
      name: "polygonA",
      intersecPerc: 0,
    },
    { nameEnglish: "Nova Scotia", name: "polygonA", intersecPerc: 0 },
    { nameEnglish: "New Brunswick", name: "polygonA", intersecPerc: 0 },
    { nameEnglish: "Quebec", name: "polygonA", intersecPerc: 0.6448 },
    { nameEnglish: "Ontario", name: "polygonA", intersecPerc: 0.332 },
    { nameEnglish: "Manitoba", name: "polygonA", intersecPerc: 0 },
    { nameEnglish: "Saskatchewan", name: "polygonA", intersecPerc: 0 },
    { nameEnglish: "Alberta", name: "polygonA", intersecPerc: 0 },
    {
      nameEnglish: "British Columbia",
      name: "polygonA",
      intersecPerc: 0,
    },
    { nameEnglish: "Yukon", name: "polygonA", intersecPerc: 0 },
    {
      nameEnglish: "Northwest Territories",
      name: "polygonA",
      intersecPerc: 0,
    },
    { nameEnglish: "Nunavut", name: "polygonA", intersecPerc: 0 },
    {
      nameEnglish: "Newfoundland and Labrador",
      name: "polygonB",
      intersecPerc: 0,
    },
    {
      nameEnglish: "Prince Edward Island",
      name: "polygonB",
      intersecPerc: 0,
    },
    { nameEnglish: "Nova Scotia", name: "polygonB", intersecPerc: 0 },
    { nameEnglish: "New Brunswick", name: "polygonB", intersecPerc: 0 },
    { nameEnglish: "Quebec", name: "polygonB", intersecPerc: 0 },
    { nameEnglish: "Ontario", name: "polygonB", intersecPerc: 0 },
    { nameEnglish: "Manitoba", name: "polygonB", intersecPerc: 0.143 },
    {
      nameEnglish: "Saskatchewan",
      name: "polygonB",
      intersecPerc: 0.294,
    },
    { nameEnglish: "Alberta", name: "polygonB", intersecPerc: 0.2992 },
    {
      nameEnglish: "British Columbia",
      name: "polygonB",
      intersecPerc: 0.0404,
    },
    { nameEnglish: "Yukon", name: "polygonB", intersecPerc: 0 },
    {
      nameEnglish: "Northwest Territories",
      name: "polygonB",
      intersecPerc: 0.1796,
    },
    { nameEnglish: "Nunavut", name: "polygonB", intersecPerc: 0.0366 },
  ]);

  await sdb.done();
});

Deno.test("should compute the intersection of geometries and add a projection", async () => {
  const sdb = new SimpleDB();

  const prov = sdb.newTable("prov");
  await prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  await prov.renameColumns({ geom: "prov" });

  const poly = sdb.newTable("poly");
  await poly.loadGeoData("test/geodata/files/polygons.geojson");
  await poly.renameColumns({ geom: "pol" });

  const joined = await prov.crossJoin(poly, { outputTable: "joined" });
  await joined.intersection("pol", "prov", "intersec");

  assertEquals(joined.projections, {
    prov: "+proj=latlong +datum=WGS84 +no_defs",
    pol: "+proj=latlong +datum=WGS84 +no_defs",
    intersec: "+proj=latlong +datum=WGS84 +no_defs",
  });

  await sdb.done();
});

Deno.test("should overwrite the intersection column if it already exists", async () => {
  const sdb = new SimpleDB();

  const prov = sdb.newTable("prov");
  await prov.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  await prov.renameColumns({ geom: "prov" });

  const poly = sdb.newTable("poly");
  await poly.loadGeoData("test/geodata/files/polygons.geojson");
  await poly.renameColumns({ geom: "pol" });

  const joined = await prov.crossJoin(poly, { outputTable: "joined" });

  // Creating the column first
  await joined.addColumn(
    "intersec",
    "geometry",
    "ST_GeomFromText('POINT(0 0)')",
    { projection: "+proj=latlong +datum=WGS84 +no_defs" },
  );

  // Computing intersection and overwriting
  await joined.intersection("pol", "prov", "intersec");
  await joined.area("intersecArea", { column: "intersec" });
  await joined.round("intersecArea");

  const data = await joined.getData();
  const totalArea = data.reduce(
    (acc, curr) => acc + (curr.intersecArea as number),
    0,
  );

  // If it was still points, the area would be 0.
  assertEquals(totalArea > 0, true);

  await sdb.done();
});

Deno.test("intersection() should overwrite existing column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadArray([
    { lat: 1, lon: 2, lat2: 1.0001, lon2: 2.0001, inter: "old" },
  ]);
  await table.points("lat", "lon", "geom1");
  await table.points("lat2", "lon2", "geom2");

  // This should now succeed and overwrite "inter"
  await table.intersection("geom1", "geom2", "inter");

  const types = await table.getTypes();
  assertEquals(types.inter, "VARCHAR");

  await sdb.done();
});
