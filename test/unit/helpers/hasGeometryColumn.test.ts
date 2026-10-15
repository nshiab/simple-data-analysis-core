import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";
import { readFile as nodeReadFile, rm as nodeRm } from "node:fs/promises";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import hasGeometryColumn from "../../../src/helpers/hasGeometryColumn.ts";

test("hasGeometryColumn - returns false when no geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", age: "number" });
  table.insertRows([{ name: "Alice", age: 30 }]);

  const result = await hasGeometryColumn(table);
  expect(result).toStrictEqual(false);

  await sdb.close();
});

test("hasGeometryColumn - returns true when geometry column exists", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", geom: "geometry('EPSG:4326')" });

  const result = await hasGeometryColumn(table);
  expect(result).toStrictEqual(true);

  await sdb.close();
});

test("getData() - throws when table has geometry columns", async () => {
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

test("getData() - works normally when no geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]);

  const data = await table.getData();
  expect(data.length).toStrictEqual(2);
  expect(data[0].name).toStrictEqual("Alice");

  await sdb.close();
});

test("getData() - can select non-geometry columns from a spatial table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.setTypes({ name: "string", geom: "geometry('EPSG:4326')" });
  table.insertRows([{ name: "Alice", geom: null }]);

  expect(await table.getData({ columns: "name" })).toStrictEqual([{ name: "Alice" }]);

  await sdb.close();
});

test("getDataAsCSV() - throws when table has geometry columns", async () => {
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

test("writeData() - throws when table has geometry columns", async () => {
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

test("writeData() - works normally when no geometry columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadArray([
    { name: "Alice", age: 30 },
    { name: "Bob", age: 25 },
  ]);

  const outputPath = "/tmp/test_writeData_no_geo.csv";
  await table.writeData(outputPath);

  // Verify the file was created
  const content = await nodeReadFile(outputPath, "utf8");
  expect(content.includes("Alice")).toStrictEqual(true);
  expect(content.includes("Bob")).toStrictEqual(true);

  // Cleanup
  await nodeRm(outputPath);
  await sdb.close();
});
