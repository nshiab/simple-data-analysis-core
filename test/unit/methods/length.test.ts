import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should calculate the length of geometries in meters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length");
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  assertEquals(data, [{ length: 70175 }]);
  await sdb.done();
});

Deno.test("should calculate the length of geometries from a specific column in meters", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length", { column: "geom" });
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  assertEquals(data, [{ length: 70175 }]);
  await sdb.done();
});

Deno.test("should calculate the length of geometries in meters from a file loaded with option toWGS84", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length");
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  assertEquals(data, [{ length: 70175 }]);
  await sdb.done();
});

Deno.test("should calculate the length of geometries in kilometers", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/line.json");
  table.length("length", { unit: "km" });
  table.round("length");
  table.selectColumns("length");
  const data = await table.getData();

  assertEquals(data, [{ length: 70 }]);
  await sdb.done();
});
