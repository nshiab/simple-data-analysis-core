import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should check if geometries are covered by other geometries", async () => {
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
  points.coveredBy("geomPoints", "geomPolygon", "isCovered");
  points.selectColumns(["points", "polygon", "isCovered"]);
  points.sort({ points: "asc" });

  const data = await points.getData();

  assertEquals(data, [
    { points: "pointA", polygon: "container", isCovered: false },
    { points: "pointB", polygon: "container", isCovered: false },
    { points: "pointC", polygon: "container", isCovered: true },
    { points: "pointD", polygon: "container", isCovered: true },
  ]);

  await sdb.close();
});
