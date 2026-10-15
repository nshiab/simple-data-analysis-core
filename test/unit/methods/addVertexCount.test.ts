import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should count the number of vertices and add the result in a new column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/triangle.json");
  table.addVertexCount("addVertexCount");
  table.selectColumns(["addVertexCount"]);

  const data = await table.getData();

  expect(data).toStrictEqual([{ addVertexCount: 4 }]);
  await sdb.close();
});

test("should count the number of vertices when checking a specific column", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("geodata");
  table.loadGeoData("test/geodata/files/triangle.json");
  table.addVertexCount("addVertexCount", { column: "geom" });
  table.selectColumns(["addVertexCount"]);
  const data = await table.getData();

  expect(data).toStrictEqual([{ addVertexCount: 4 }]);
  await sdb.close();
});
