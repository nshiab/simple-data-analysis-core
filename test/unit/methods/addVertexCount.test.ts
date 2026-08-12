import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should count the number of vertices and add the result in a new column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/triangle.json");
  table.addVertexCount("addVertexCount");
  table.selectColumns(["addVertexCount"]);

  const data = await table.getData();

  assertEquals(data, [{ addVertexCount: 4 }]);
  await sdb.close();
});

Deno.test("should count the number of vertices when checking a specific column", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/triangle.json");
  table.addVertexCount("addVertexCount", { column: "geom" });
  table.selectColumns(["addVertexCount"]);
  const data = await table.getData();

  assertEquals(data, [{ addVertexCount: 4 }]);
  await sdb.close();
});
