import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import hasGeometryColumn from "../../../src/helpers/hasGeometryColumn.ts";

Deno.test("hasGeometryColumn - returns false when no geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", age: "number" });
  table.insertRows([{ name: "Alice", age: 30 }]);

  const result = await hasGeometryColumn(table);
  assertEquals(result, false);

  await sdb.close();
});

Deno.test("hasGeometryColumn - returns true when geometry column exists", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", geom: "geometry('EPSG:4326')" });

  const result = await hasGeometryColumn(table);
  assertEquals(result, true);

  await sdb.close();
});

Deno.test("getData() - throws when table has geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", geom: "geometry('EPSG:4326')" });

  await assertRejects(
    async () => await table.getData(),
    Error,
    "The query returns geometry columns. Use getGeoData() instead.",
  );

  await sdb.close();
});

Deno.test("getData() - works normally when no geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]);

  const data = await table.getData();
  assertEquals(data.length, 2);
  assertEquals(data[0].name, "Alice");

  await sdb.close();
});

Deno.test("getData() - can select non-geometry columns from a spatial table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", geom: "geometry('EPSG:4326')" });
  table.insertRows([{ name: "Alice", geom: null }]);

  assertEquals(await table.getData({ columns: "name" }), [{ name: "Alice" }]);

  await sdb.close();
});

Deno.test("getDataAsCSV() - throws when table has geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", geom: "geometry('EPSG:4326')" });

  await assertRejects(
    async () => await table.getDataAsCSV(),
    Error,
    "The query returns geometry columns. Use getGeoData() instead.",
  );

  await sdb.close();
});

Deno.test("writeData() - throws when table has geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", geom: "geometry('EPSG:4326')" });

  await assertRejects(
    async () => await table.writeData("/tmp/test_output.csv"),
    Error,
    "Table contains geometry columns. Use writeGeoData() instead.",
  );

  await sdb.close();
});

Deno.test("writeData() - works normally when no geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]);

  const outputPath = "/tmp/test_writeData_no_geo.csv";
  await table.writeData(outputPath);

  // Verify the file was created
  const content = await Deno.readTextFile(outputPath);
  assertEquals(content.includes("Alice"), true);
  assertEquals(content.includes("Bob"), true);

  // Cleanup
  Deno.remove(outputPath);
  await sdb.close();
});
