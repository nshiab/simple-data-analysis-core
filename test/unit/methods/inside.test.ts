import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should check if geometries are inside other geometries", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  const points = sdb.newTable("points");
  points.loadGeoData("test/geodata/files/pointsInside.json");
  points.renameColumns({
    name: "points",
    geom: "geomPoints",
  });

  const polygon = sdb.newTable("polygon");
  polygon.loadGeoData("test/geodata/files/polygonInside.json");
  polygon.renameColumns({
    name: "polygon",
    geom: "geomPolygon",
  });

  points.crossJoin(polygon);
  points.inside("geomPoints", "geomPolygon", "isInside");
  points.selectColumns(["points", "polygon", "isInside"]);
  points.sort({ points: "asc" });

  const data = await points.getData();

  assertEquals(data, [
    { points: "pointA", polygon: "container", isInside: false },
    { points: "pointB", polygon: "container", isInside: false },
    { points: "pointC", polygon: "container", isInside: true },
    { points: "pointD", polygon: "container", isInside: true },
  ]);

  await sdb.done();
});
