import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("should add rows from a table into another table", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData("test/data/files/data.json");

  const table2 = sdb.newTable("table2");
  table2.loadData("test/data/files/data.json");

  table1.insertTables(table2);
  const data = await table1.getData();
  assertEquals(data, [
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
  ]);
  await sdb.done();
});

Deno.test("should add rows from a table into another table even if the column order is not the same", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData("test/data/files/data.json");

  const table2 = sdb.newTable("table2");
  table2.loadData("test/data/files/data.json");
  table2.selectColumns(["key2", "key1"]);

  table1.insertTables(table2);
  const data = await table1.getData();
  assertEquals(data, [
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
  ]);
  await sdb.done();
});
Deno.test("should throw an error if the tables have different columns", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadData("test/data/files/data.json");

  const table2 = sdb.newTable();
  table2.loadData("test/data/files/data.json");
  table2.selectColumns(["key2"]);

  // insertTables() queues the operation; run() executes it.
  await assertRejects(() => table1.insertTables(table2).run());

  await sdb.done();
});

Deno.test("should add rows from multiple tables into another table", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData("test/data/files/data.json");

  const table2 = sdb.newTable("table2");
  table2.loadData("test/data/files/data.json");

  const table3 = sdb.newTable("table3");
  table3.loadData("test/data/files/data.json");

  table1.insertTables([table2, table3]);
  const data = await table1.getData();
  assertEquals(data, [
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
    { key1: 1, key2: "un" },
    { key1: 2, key2: "deux" },
    { key1: 3, key2: "trois" },
    { key1: 4, key2: "quatre" },
  ]);
  await sdb.done();
});
Deno.test("should add rows from tables with different columns", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadArray([
    { firstName: "John", lastName: "Doe" },
    { firstName: "Jane", lastName: "Doe" },
  ]);

  const table2 = sdb.newTable("table2");
  table2.loadArray([
    { firstName: "Anthony", age: 25 },
    { firstName: "Eleonore", age: 22 },
  ]);

  const table3 = sdb.newTable("table3");
  table3.loadArray([
    { city: "Montreal" },
    { city: "Toronto" },
  ]);

  table1.insertTables([table2, table3], { unifyColumns: true });
  const data = await table1.getData();
  assertEquals(data, [
    { firstName: "John", lastName: "Doe", age: null, city: null },
    { firstName: "Jane", lastName: "Doe", age: null, city: null },
    { firstName: "Anthony", lastName: null, age: 25, city: null },
    { firstName: "Eleonore", lastName: null, age: 22, city: null },
    { firstName: null, lastName: null, age: null, city: "Montreal" },
    { firstName: null, lastName: null, age: null, city: "Toronto" },
  ]);
  await sdb.done();
});
Deno.test("should add rows from tables with different columns without adding columns to the original tables", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadArray([
    { firstName: "John", lastName: "Doe" },
    { firstName: "Jane", lastName: "Doe" },
  ]);

  const table2 = sdb.newTable("table2");
  table2.loadArray([
    { firstName: "Anthony", age: 25 },
    { firstName: "Eleonore", age: 22 },
  ]);

  const table3 = sdb.newTable("table3");
  table3.loadArray([
    { city: "Montreal" },
    { city: "Toronto" },
  ]);

  table1.insertTables([table2, table3], { unifyColumns: true });
  const data = await table1.getData();
  const data2 = await table2.getData();
  const data3 = await table3.getData();
  assertEquals({ data, data2, data3 }, {
    data: [
      { firstName: "John", lastName: "Doe", age: null, city: null },
      { firstName: "Jane", lastName: "Doe", age: null, city: null },
      { firstName: "Anthony", lastName: null, age: 25, city: null },
      { firstName: "Eleonore", lastName: null, age: 22, city: null },
      { firstName: null, lastName: null, age: null, city: "Montreal" },
      { firstName: null, lastName: null, age: null, city: "Toronto" },
    ],
    data2: [
      { firstName: "Anthony", age: 25 },
      { firstName: "Eleonore", age: 22 },
    ],
    data3: [
      { city: "Montreal" },
      { city: "Toronto" },
    ],
  });
  await sdb.done();
});
Deno.test("should add rows from tables with geometries", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.latLon("geom", "lat", "lon");

  table1.insertTables(table2, { unifyColumns: true });

  const types = await table1.getTypes();

  assertEquals({ types }, {
    types: {
      nameEnglish: "VARCHAR",
      nameFrench: "VARCHAR",
      geom: "GEOMETRY('EPSG:4326')",
      lat: "DOUBLE",
      lon: "DOUBLE",
    },
  });
  await sdb.done();
});
Deno.test("should throw an error if geometry projections are not the same", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  table1.selectColumns("geom");

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.reproject("EPSG:3347");
  table2.selectColumns("geom");

  await assertRejects(() => table1.insertTables(table2).run());

  await sdb.done();
});
Deno.test("should throw an error if geometry projections are not the same, even if columns are unified", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.reproject("EPSG:3347");
  table2.latLon("geom", "lat", "lon");

  await assertRejects(() =>
    table1.insertTables(table2, { unifyColumns: true }).run()
  );

  await sdb.done();
});
Deno.test("should add rows with geometries to a table without geometries", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadData(
    "test/data/files/cities.csv",
  );

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.latLon("geom", "lat", "lon");

  table1.insertTables(table2, { unifyColumns: true });

  const types = await table1.getTypes();

  assertEquals({ types }, {
    types: {
      id: "BIGINT",
      city: "VARCHAR",
      geom: "GEOMETRY('EPSG:4326')",
      lat: "DOUBLE",
      lon: "DOUBLE",
    },
  });
  await sdb.done();
});
Deno.test("should add rows without geometries to a table with geometries", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadData(
    "test/data/files/cities.csv",
  );

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.latLon("geom", "lat", "lon");

  table2.insertTables(table1, { unifyColumns: true });

  const types = await table2.getTypes();

  assertEquals({ types }, {
    types: {
      id: "BIGINT",
      city: "VARCHAR",
      geom: "GEOMETRY('EPSG:4326')",
      lat: "DOUBLE",
      lon: "DOUBLE",
    },
  });
  await sdb.done();
});
Deno.test("should add rows and unify columns when the second table has more columns", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadGeoData(
    "test/geodata/files/point.json",
  );

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.latLon("geom", "lat", "lon");

  table1.insertTables(table2, { unifyColumns: true });

  const types = await table1.getTypes();

  assertEquals({ types }, {
    types: {
      geom: "GEOMETRY('EPSG:4326')",
      lat: "DOUBLE",
      lon: "DOUBLE",
    },
  });
  await sdb.done();
});
Deno.test("should add rows with tables with multiple geometry columns", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();
  table1.loadGeoData(
    "test/geodata/files/point.json",
  );
  table1.cloneColumn("geom", "geom2");
  table1.reproject("EPSG:3347", { column: "geom2" });

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.latLon("geom", "lat", "lon");
  table2.cloneColumn("geom", "geom2");
  table2.reproject("EPSG:3347", { column: "geom2" });

  table1.insertTables(table2, { unifyColumns: true });

  const types = await table1.getTypes();

  assertEquals({ types }, {
    types: {
      geom: "GEOMETRY('EPSG:4326')",
      geom2: "GEOMETRY('EPSG:3347')",
      lat: "DOUBLE",
      lon: "DOUBLE",
    },
  });
  await sdb.done();
});
Deno.test("should return the table", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData("test/data/files/data.json");

  const table2 = sdb.newTable("table2");
  table2.loadData("test/data/files/data.json");

  const result = table1.insertTables(table2);
  assertEquals(result instanceof SimpleTable, true);
  assertEquals(result.name, "table1");
  await result.run();
  await sdb.done();
});
Deno.test("should add rows to an empty table", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();

  const table2 = sdb.newTable();
  table2.loadArray([
    { first: "John", last: "Doe" },
    { first: "Jane", last: "Doe" },
  ]);

  table1.insertTables(table2);

  assertEquals(await table1.getData(), [
    { first: "John", last: "Doe" },
    { first: "Jane", last: "Doe" },
  ]);
  await sdb.done();
});
Deno.test("should add rows with geometries to an empty table", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable();

  const table2 = sdb.newTable();
  table2.loadGeoData("test/geodata/files/point.json");
  table2.latLon("geom", "lat", "lon");

  table1.insertTables(table2, { unifyColumns: true });

  const types = await table1.getTypes();

  assertEquals({ types }, {
    types: {
      geom: "GEOMETRY('EPSG:4326')",
      lat: "DOUBLE",
      lon: "DOUBLE",
    },
  });
  await sdb.done();
});
