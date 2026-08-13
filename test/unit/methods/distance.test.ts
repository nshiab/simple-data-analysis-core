import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should calculate the distance between points with the SRS unit", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadGeoData("test/geodata/files/coordinates.geojson");
  const clone = table.clone();
  clone.renameColumns({ geom: "geom_1", name: "name_1" });

  table.crossJoin(clone);
  table.distance("geom", "geom_1", "dist");
  table.selectColumns(["name", "name_1", "dist"]);
  table.round("dist", { decimals: 3 });

  const data = await table.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 5.655 },
    { name: "vancouver", name_1: "toronto", dist: 43.99 },
    { name: "toronto", name_1: "montreal", dist: 5.655 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 49.241 },
    { name: "toronto", name_1: "vancouver", dist: 43.99 },
    { name: "montreal", name_1: "vancouver", dist: 49.241 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points with the SRS unit and round values", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadGeoData("test/geodata/files/coordinates.geojson");
  const clone = table.clone();
  clone.renameColumns({ geom: "geom_1", name: "name_1" });

  table.crossJoin(clone);
  table.distance("geom", "geom_1", "dist", { decimals: 3 });
  table.selectColumns(["name", "name_1", "dist"]);

  const data = await table.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 5.655 },
    { name: "vancouver", name_1: "toronto", dist: 43.99 },
    { name: "toronto", name_1: "montreal", dist: 5.655 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 49.241 },
    { name: "toronto", name_1: "vancouver", dist: 43.99 },
    { name: "montreal", name_1: "vancouver", dist: 49.241 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points and lines in the SRS unit", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const line = sdb.newTable("line");
  line.loadGeoData("test/geodata/files/line.json");
  line.renameColumns({ geom: "geom_1" });

  points.crossJoin(line);
  points.distance("geom", "geom_1", "dist");
  points.selectColumns(["name", "dist"]);
  points.round("dist", { decimals: 3 });

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", dist: 3.968 },
    { name: "montreal", dist: 1.826 },
    { name: "vancouver", dist: 47.237 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points and polygons in the SRS unit", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const polygon = sdb.newTable("polygon");
  polygon.loadGeoData("test/geodata/files/polygon.json");
  polygon.renameColumns({ geom: "geom_1" });

  points.crossJoin(polygon);
  points.distance("geom", "geom_1", "dist");
  points.selectColumns(["name", "dist"]);
  points.round("dist", { decimals: 3 });

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", dist: 3.615 },
    { name: "montreal", dist: 1.509 },
    { name: "vancouver", dist: 47.071 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points with the haversine method in meters", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const pointsCloned = points.clone();
  pointsCloned.renameColumns({ geom: "geom_1", name: "name_1" });

  points.crossJoin(pointsCloned);
  points.distance("geom", "geom_1", "dist", {
    method: "haversine",
  });
  points.selectColumns(["name", "name_1", "dist"]);
  points.round("dist");

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 464577 },
    { name: "vancouver", name_1: "toronto", dist: 3350989 },
    { name: "toronto", name_1: "montreal", dist: 464577 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 3666382 },
    { name: "toronto", name_1: "vancouver", dist: 3350989 },
    { name: "montreal", name_1: "vancouver", dist: 3666382 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points with the haversine method in meters and round values", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const pointsCloned = points.clone();
  pointsCloned.renameColumns({ geom: "geom_1", name: "name_1" });

  points.crossJoin(pointsCloned);
  points.distance("geom", "geom_1", "dist", {
    method: "haversine",
    decimals: 0,
  });
  points.selectColumns(["name", "name_1", "dist"]);

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 464577 },
    { name: "vancouver", name_1: "toronto", dist: 3350989 },
    { name: "toronto", name_1: "montreal", dist: 464577 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 3666382 },
    { name: "toronto", name_1: "vancouver", dist: 3350989 },
    { name: "montreal", name_1: "vancouver", dist: 3666382 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});
Deno.test("should calculate the distance between points with the haversine method in meters", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const pointsCloned = points.clone();
  pointsCloned.renameColumns({ geom: "geom_1", name: "name_1" });

  points.crossJoin(pointsCloned);
  points.distance("geom", "geom_1", "dist", {
    method: "haversine",
  });
  points.selectColumns(["name", "name_1", "dist"]);
  points.round("dist");

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 464577 },
    { name: "vancouver", name_1: "toronto", dist: 3350989 },
    { name: "toronto", name_1: "montreal", dist: 464577 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 3666382 },
    { name: "toronto", name_1: "vancouver", dist: 3350989 },
    { name: "montreal", name_1: "vancouver", dist: 3666382 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points with the haversine method in km", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const pointsCloned = points.clone();
  pointsCloned.renameColumns({ geom: "geom_1", name: "name_1" });

  points.crossJoin(pointsCloned);
  points.distance("geom", "geom_1", "dist", {
    method: "haversine",
    unit: "km",
  });
  points.selectColumns(["name", "name_1", "dist"]);
  points.round("dist");

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 465 },
    { name: "vancouver", name_1: "toronto", dist: 3351 },
    { name: "toronto", name_1: "montreal", dist: 465 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 3666 },
    { name: "toronto", name_1: "vancouver", dist: 3351 },
    { name: "montreal", name_1: "vancouver", dist: 3666 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points with the spheroid method in m", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const pointsCloned = points.clone();
  pointsCloned.renameColumns({ geom: "geom_1", name: "name_1" });

  points.crossJoin(pointsCloned);
  points.distance("geom", "geom_1", "dist", {
    method: "spheroid",
  });
  points.selectColumns(["name", "name_1", "dist"]);
  points.round("dist");

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 465639 },
    { name: "vancouver", name_1: "toronto", dist: 3360308 },
    { name: "toronto", name_1: "montreal", dist: 465639 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 3676968 },
    { name: "toronto", name_1: "vancouver", dist: 3360308 },
    { name: "montreal", name_1: "vancouver", dist: 3676968 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points with the spheroid method in m and round values", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const pointsCloned = points.clone();
  pointsCloned.renameColumns({ geom: "geom_1", name: "name_1" });

  points.crossJoin(pointsCloned);
  points.distance("geom", "geom_1", "dist", {
    method: "spheroid",
    decimals: 0,
  });
  points.selectColumns(["name", "name_1", "dist"]);

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 465639 },
    { name: "vancouver", name_1: "toronto", dist: 3360308 },
    { name: "toronto", name_1: "montreal", dist: 465639 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 3676968 },
    { name: "toronto", name_1: "vancouver", dist: 3360308 },
    { name: "montreal", name_1: "vancouver", dist: 3676968 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});

Deno.test("should calculate the distance between points with the spheroid method in km", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/coordinates.geojson");
  const pointsCloned = points.clone();
  pointsCloned.renameColumns({ geom: "geom_1", name: "name_1" });

  points.crossJoin(pointsCloned);
  points.distance("geom", "geom_1", "dist", {
    method: "spheroid",
    unit: "km",
  });
  points.selectColumns(["name", "name_1", "dist"]);
  points.round("dist");

  const data = await points.getData();

  assertEquals(data, [
    { name: "toronto", name_1: "toronto", dist: 0 },
    { name: "montreal", name_1: "toronto", dist: 466 },
    { name: "vancouver", name_1: "toronto", dist: 3360 },
    { name: "toronto", name_1: "montreal", dist: 466 },
    { name: "montreal", name_1: "montreal", dist: 0 },
    { name: "vancouver", name_1: "montreal", dist: 3677 },
    { name: "toronto", name_1: "vancouver", dist: 3360 },
    { name: "montreal", name_1: "vancouver", dist: 3677 },
    { name: "vancouver", name_1: "vancouver", dist: 0 },
  ]);

  await sdb.close();
});
