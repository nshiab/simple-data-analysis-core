import { assert, assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SDAError from "../../../src/class/SDAError.ts";
import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";

const output = "./test/output/";
if (!existsSync(output)) {
  mkdirSync(output);
}

Deno.test("should instantiate a SimpleDB class", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  assertEquals(sdb instanceof SimpleDB, true);
  await sdb.close();
});
Deno.test("should start and instantiate a db", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.start();
  assertEquals(sdb.db instanceof DuckDBInstance, true);
  await sdb.close();
});

Deno.test("should start and return an instance of SimpleDB", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const returned = await sdb.start();
  assertEquals(returned instanceof SimpleDB, true);
  await sdb.close();
});
Deno.test("should start and instantiate a connection", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.start();
  assertEquals(sdb.connection instanceof DuckDBConnection, true);
  await sdb.close();
});

Deno.test("should run a custom query and return the result", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const result = await sdb.customQuery(`select 42 as result`, {
    returnData: true,
  });
  assertEquals(result, [{ result: 42 }]);
  await sdb.close();
});

Deno.test("should create tables without names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  // Table 2 first to make sure results are sorted alphabetically
  const table1 = sdb.newTable("table2");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table1");
  table2.loadData(["test/data/files/data.json"]);

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["table1", "table2"],
  );
  await sdb.close();
});

Deno.test("should create multiple tables without names before loading data", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  const table1 = sdb.newTable();
  const table2 = sdb.newTable();

  table1.loadData(["test/data/files/data.json"]);
  table2.loadData(["test/data/files/data.json"]);

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["table1", "table2"],
  );
  await sdb.close();
});

Deno.test("should create tables with names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("tableWithName");
  table.loadData(["test/data/files/data.json"]);

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["tableWithName"],
  );
  await sdb.close();
});

Deno.test("should remove one table as an instance", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.removeTables(table1);

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["table2"],
  );
  await sdb.close();
});

Deno.test("should remove one table as a string", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.removeTables("table1");

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["table2"],
  );
  await sdb.close();
});

Deno.test("should remove multiple tables as instances or strings", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const tableWithName = sdb.newTable("tableWithName");
  tableWithName.loadData(["test/data/files/data.json"]);

  await sdb.removeTables(["table1", tableWithName]);

  const tables = sdb.getTables();

  assertEquals(tables, []);
  await sdb.close();
});

Deno.test("should remove all tables with 'all'", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);
  const table3 = sdb.newTable("table3");
  table3.loadData(["test/data/files/data.json"]);

  await sdb.removeTables("all");

  const tables = sdb.getTables();

  assertEquals(tables, []);
  await sdb.close();
});

Deno.test("should select one table as an instance", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.selectTables(table1);

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["table1"],
  );
  await sdb.close();
});
Deno.test("should select one table as a string", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.selectTables("table1");

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["table1"],
  );
  await sdb.close();
});

Deno.test("should select multiple tables as instances or strings", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);
  const tableWithName = sdb.newTable("tableWithName");
  tableWithName.loadData(["test/data/files/data.json"]);

  await sdb.selectTables(["table1", table2]);

  const tables = await sdb.getTableNames();

  assertEquals(tables.sort((a, b) => (a > b ? 1 : -1)), ["table1", "table2"]);
  await sdb.close();
});

Deno.test("should retrieve a SimpleTable instance", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);

  const tableJsonAgain = await sdb.getTable("tableJSON");

  assertEquals(
    {
      instance: tableJsonAgain,
      name: tableJsonAgain.name,
      data: await tableJsonAgain.getData(),
    },
    {
      instance: tableJSON,
      name: tableJSON.name,
      data: await tableJSON.getData(),
    },
  );
  await sdb.close();
});
Deno.test("should list available tables when getTable cannot find one", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  sdb.newTable("votes");
  sdb.newTable("districts");

  const error = await assertRejects(() => sdb.getTable("missing"));
  assert(error instanceof Error);
  assertEquals(
    error.message,
    `getTable() could not find table "missing". Available tables: "districts", "votes".`,
  );

  await sdb.close();
});
Deno.test("should list missing and available tables for selectTables", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const votes = sdb.newTable("votes");
  votes.loadArray([{ id: 1 }]);
  const districts = sdb.newTable("districts");
  districts.loadArray([{ id: 1 }]);

  const error = await assertRejects(() =>
    sdb.selectTables(["missingVotes", "missingDistricts"])
  );
  assert(error instanceof Error);
  assertEquals(
    error.message,
    `selectTables() could not find tables "missingDistricts", "missingVotes". Available tables: "districts", "votes".`,
  );

  await sdb.close();
});
Deno.test("should retrieve a SimpleTable instance with geo data", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const tableJSON = sdb.newTable("tableGEOJSON");
  tableJSON.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );

  const tableJsonAgain = await sdb.getTable("tableGEOJSON");

  assertEquals(
    {
      instance: tableJsonAgain,
      name: tableJsonAgain.name,
      data: await tableJsonAgain.getGeoData(),
    },
    {
      instance: tableJSON,
      name: tableJSON.name,
      data: await tableJSON.getGeoData(),
    },
  );
  await sdb.close();
});

Deno.test("should return table names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);
  const tableCSV = sdb.newTable("tableCSV");
  tableCSV.loadData(["test/data/files/data.csv"]);

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? 1 : -1)),
    ["tableCSV", "tableJSON"],
  );
  await sdb.close();
});

Deno.test("should return true when a table exists", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);

  assertEquals(await sdb.hasTable("tableJSON"), true);
  await sdb.close();
});

Deno.test("should return false when a table doesn't exist", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);

  assertEquals(await sdb.hasTable("tableX"), false);
  await sdb.close();
});

Deno.test("should return the DuckDB extensions", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.getExtensions();
  // Not sure how to test. Different depending on the environment?
  await sdb.close();
});

Deno.test("should close the db", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.close();
  // How to test?
});

Deno.test("should explain when the connection closes before an async method finishes", async () => {
  const sdb = new SimpleDB();
  const logPromise = sdb.newTable("test").loadArray([{ value: 1 }]).log();
  const rejection = assertRejects(
    () => logPromise,
    SDAError,
    "Database connection closed before all operations finished. Did you forget to add `await`?",
  );

  await sdb.close();
  await rejection;
});

Deno.test("file-backed close executes all pending work before cleanup", async () => {
  const file = `${output}pending_done.db`;
  const tempDir = `${output}pending_done.tmp`;
  const sdb = new SimpleDB({
    dataTransport: "file",
    file,
    overwrite: true,
    tempDir,
  });
  await sdb.start();
  mkdirSync(tempDir, { recursive: true });
  const first = sdb.newTable("first pending");
  const second = sdb.newTable("second pending");
  first.loadArray([{ value: 1 }]).filter("value > 0");
  second.loadArray([{ value: 2 }]);

  await sdb.close();

  assertEquals(first.pendingOps.length, 0);
  assertEquals(second.pendingOps.length, 0);
  assertEquals(existsSync(tempDir), false);
  await assertRejects(() => sdb.connection.run("SELECT 1"));
});

Deno.test("should log SQL when logSQL is true", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", logSQL: true });
  const test = await sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");

  // How to test?
  await test.run();
  await sdb.close();
});

Deno.test("should log the types", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", typesToLog: true });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  // await test.log();
  // How to test?
  await test.run();
  await sdb.close();
});

Deno.test("should log a specific number of rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", rowsToLog: 2 });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  // await test.log();
  // How to test?
  await test.run();
  await sdb.close();
});

Deno.test("should log a specific number of characters", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", charsToLog: 5 });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  // await test.log();
  // How to test?
  await test.run();
  await sdb.close();
});
Deno.test("should log the total duration", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", logDuration: true });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  // How to test?
  await test.run();
  await sdb.close();
});
Deno.test("should enable a progress bar", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", progressBar: true });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  // How to test?
  await test.run();
  await sdb.close();
});
Deno.test("should write the db", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");

  await sdb.writeDB(`${output}database.db`);
  // How to test?
  await sdb.close();
});
Deno.test("should write the SQLite db", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");

  await sdb.writeDB(`${output}database.sqlite`);
  // How to test?
  await sdb.close();
});
Deno.test("should throw when writing the db with an unsupported extension", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  await test.run();

  await assertRejects(
    () => sdb.writeDB(`${output}database.txt`),
    Error,
    "The extension txt is not supported",
  );

  await sdb.close();
});
Deno.test("should load the db", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  await sdb.loadDB(`${output}database.db`);
  // const test = await sdb.getTable("test");
  // await test.log();

  // How to test?
  await sdb.close();
});
Deno.test("should load the db with a specific name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  await sdb.loadDB(`${output}database.db`, { name: 'some "thing' });
  // const test = await sdb.getTable("test");
  // await test.log();

  // How to test?
  await sdb.close();
});
Deno.test("should load the sqlite db with a specific name", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  await sdb.loadDB(`${output}database.sqlite`, { name: 'some "thing' });
  // const test = await sdb.getTable("test");
  // await test.log();

  await sdb.close();
});
Deno.test("should load the db with and don't detach", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  await sdb.loadDB(`${output}database.db`, { detach: false });
  // const test = await sdb.getTable("test");
  // await test.log();

  // How to test?
  await sdb.close();
});
Deno.test("should load the sqlite db and don't detach", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  await sdb.loadDB(`${output}database.sqlite`, { detach: false });
  // const test = await sdb.getTable("test");
  // await test.log();

  await sdb.close();
});
Deno.test("should load the sqlite db", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  await sdb.loadDB(`${output}database.sqlite`);
  // const test = await sdb.getTable("test");
  // await test.log();

  await sdb.close();
});
Deno.test("should throw when loading a db with an unsupported extension", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  // loadDB() checks the file exists before checking its extension.
  writeFileSync(`${output}database.txt`, "");

  await assertRejects(
    () => sdb.loadDB(`${output}database.txt`),
    Error,
    "The extension txt is not supported",
  );

  await sdb.close();
});
Deno.test("should throw when loading a db file that doesn't exist", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });

  await assertRejects(
    () => sdb.loadDB(`${output}notARealDatabase.db`),
    Error,
    "does not exist",
  );

  await sdb.close();
});
Deno.test("should write the db with geometries", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const test = sdb.newTable("test");
  test.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  // await test.logProjections();
  // await test.log();

  await sdb.writeDB(`${output}database_geometry.db`);
  // How to test?
  await sdb.close();
});
Deno.test("should load the db with geometries", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.loadDB(`${output}database_geometry.db`);
  const test = await sdb.getTable("test");
  // await test.logProjections();
  test.simplify(0.1);
  // await test.log();
  // How to test?
  await test.run();
  await sdb.close();
});
Deno.test("should log the table names in the db", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  const test1 = sdb.newTable("test1");
  test1.loadData("test/data/files/cities.csv");

  // await sdb.logTableNames();

  // How to test?
  await sdb.run();
  await sdb.close();
});
Deno.test("should instantiate by creating a new file", async () => {
  const sdb = new SimpleDB({
    dataTransport: "file",
    file: `${output}database_new.db`,
    overwrite: true,
  });
  const data = sdb.newTable("data");
  data.loadData("test/data/files/data.csv");
  // await data.log();

  await data.run();
  await sdb.close();
});
Deno.test("should load a db created when instantiating", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.loadDB(`${output}database_new.db`);
  const data2 = sdb.newTable("data2");
  data2.loadData("test/data/files/data.csv");
  // await data2.log();

  await data2.run();
  await sdb.close();
});
Deno.test("should instantiate by creating a new file and geospatial data", async () => {
  const sdb = new SimpleDB({
    dataTransport: "file",
    file: `${output}database_new_geo.db`,
    overwrite: true,
  });
  const data = sdb.newTable("geodata");
  data.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  // await data.log();

  await data.run();
  await sdb.close();
});
Deno.test("should load a db created with geospatial data", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.loadDB(`${output}database_new_geo.db`);
  const data = await sdb.getTable("geodata");
  data.simplify(0.1);
  // await data.logProjections();
  // await data.log();

  await data.run();
  await sdb.close();
});
Deno.test("should not change the enable_external_file_cache option", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", duckDbCache: null });
  await sdb.start();
  await sdb.close();
});
Deno.test("should set the enable_external_file_cache option to true", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", duckDbCache: true });
  await sdb.start();
  await sdb.close();
});
Deno.test("should set the enable_external_file_cache option to false", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", duckDbCache: false });
  await sdb.start();
  await sdb.close();
});
Deno.test("should respect the data types when returning data with custom query", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();

  const data = [
    { date: new Date("2023-01-01"), value: 10 },
    { date: new Date("2023-02-01"), value: 20 },
    { date: new Date("2023-03-01"), value: 30 },
    { date: new Date("2023-04-01"), value: 40 },
  ];
  table.loadArray(data);

  const returnedData = await sdb.customQuery(
    `SELECT date, value FROM "${table.name}"`,
    {
      returnData: true,
      table: table.name,
    },
  );

  assertEquals(returnedData, data);
  await sdb.close();
});
Deno.test("should create a DB with bm25 index", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("data");
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  table.bm25("italian food", "Dish", "Recipe", 10, { verbose: true });
  // await table.log(1);

  await sdb.writeDB(`${output}database_bm25.db`);

  // Just making sure it's doesnt crash for now
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should load a DB with bm25 index", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.loadDB(`${output}database_bm25.db`);
  const table = await sdb.getTable("data");
  await table.getRowCount();
  // Just making sure it's doesnt crash for now
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should instantiate by creating a new file and add bm25 index", async () => {
  const sdb = new SimpleDB({
    dataTransport: "file",
    file: `${output}database_bm25_new.db`,
    overwrite: true,
  });
  const table = sdb.newTable("data");
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  table.bm25("italian food", "Dish", "Recipe", 10, { verbose: true });
  // await table.log(1);

  // Just making sure it's doesnt crash for now
  assertEquals(true, true);
  await table.run();
  await sdb.close();
});
Deno.test("should load a DB instantiated with a file, with bm25 index", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  await sdb.loadDB(`${output}database_bm25_new.db`);
  const table = await sdb.getTable("data");
  await table.getRowCount();
  // Just making sure it's doesnt crash for now
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should start with memoryLimit option", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", memoryLimit: "1GB" });
  await sdb.start();
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should start with tempDir option", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", tempDir: `${output}tmp` });
  await sdb.start();
  assertEquals(true, true);
  await sdb.close();
});
