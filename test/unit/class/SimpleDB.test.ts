import { stripVTControlCharacters } from "node:util";
import { test, expect, vi } from "vite-plus/test";
import { ok as assert } from "node:assert/strict";
import { assertRejects, assertThrows } from "../../helpers/assertions.ts";
import { statSync as nodeStatSync, readFileSync as nodeReadFileSync } from "node:fs";

import SimpleDB from "../../../src/class/SimpleDB.ts";
import SDAError from "../../../src/class/SDAError.ts";
import { DuckDBConnection, DuckDBInstance } from "@duckdb/node-api";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import withDbFiles from "../../helpers/withDbFiles.ts";

const output = "./test/output/";
if (!existsSync(output)) {
  mkdirSync(output);
}

test("should instantiate a SimpleDB class", async () => {
  const sdb = new SimpleDB();
  expect(sdb instanceof SimpleDB).toStrictEqual(true);
  await sdb.close();
});
test("should start and instantiate a db", async () => {
  const sdb = new SimpleDB();
  await sdb.start();
  expect(sdb.db instanceof DuckDBInstance).toStrictEqual(true);
  await sdb.close();
});

test("should start and return an instance of SimpleDB", async () => {
  const sdb = new SimpleDB();
  const returned = await sdb.start();
  expect(returned instanceof SimpleDB).toStrictEqual(true);
  await sdb.close();
});
test("should start and instantiate a connection", async () => {
  const sdb = new SimpleDB();
  await sdb.start();
  expect(sdb.connection instanceof DuckDBConnection).toStrictEqual(true);
  await sdb.close();
});

test("should run a custom query and return the result", async () => {
  const sdb = new SimpleDB();
  const result = await sdb.customQuery(`select 42 as result`, {
    returnData: true,
  });
  expect(result).toStrictEqual([{ result: 42 }]);
  await sdb.close();
});

test("should create tables without names", async () => {
  const sdb = new SimpleDB();
  // Table 2 first to make sure results are sorted alphabetically
  const table1 = sdb.newTable("table2");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table1");
  table2.loadData(["test/data/files/data.json"]);

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["table1", "table2"]);
  await sdb.close();
});

test("should create multiple tables without names before loading data", async () => {
  const sdb = new SimpleDB();

  const table1 = sdb.newTable();
  const table2 = sdb.newTable();

  table1.loadData(["test/data/files/data.json"]);
  table2.loadData(["test/data/files/data.json"]);

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["table1", "table2"]);
  await sdb.close();
});

test("should create tables with names", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("tableWithName");
  table.loadData(["test/data/files/data.json"]);

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["tableWithName"]);
  await sdb.close();
});

test("should remove one table as an instance", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.removeTables(table1);

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["table2"]);
  await sdb.close();
});

test("should remove one table as a string", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.removeTables("table1");

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["table2"]);
  await sdb.close();
});

test("should remove multiple tables as instances or strings", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const tableWithName = sdb.newTable("tableWithName");
  tableWithName.loadData(["test/data/files/data.json"]);

  await sdb.removeTables(["table1", tableWithName]);

  const tables = sdb.getTables();

  expect(tables).toStrictEqual([]);
  await sdb.close();
});

test("should remove all tables with 'all'", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);
  const table3 = sdb.newTable("table3");
  table3.loadData(["test/data/files/data.json"]);

  await sdb.removeTables("all");

  const tables = sdb.getTables();

  expect(tables).toStrictEqual([]);
  await sdb.close();
});

test("should select one table as an instance", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.selectTables(table1);

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["table1"]);
  await sdb.close();
});
test("should select one table as a string", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);

  await sdb.selectTables("table1");

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["table1"]);
  await sdb.close();
});

test("should select multiple tables as instances or strings", async () => {
  const sdb = new SimpleDB();
  const table1 = sdb.newTable("table1");
  table1.loadData(["test/data/files/data.json"]);
  const table2 = sdb.newTable("table2");
  table2.loadData(["test/data/files/data.json"]);
  const tableWithName = sdb.newTable("tableWithName");
  tableWithName.loadData(["test/data/files/data.json"]);

  await sdb.selectTables(["table1", table2]);

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["table1", "table2"]);
  await sdb.close();
});

test("should retrieve a SimpleTable instance", async () => {
  const sdb = new SimpleDB();
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);

  const tableJsonAgain = await sdb.getTable("tableJSON");

  expect({
    instance: tableJsonAgain,
    name: tableJsonAgain.name,
    data: await tableJsonAgain.getData(),
  }).toStrictEqual({
    instance: tableJSON,
    name: tableJSON.name,
    data: await tableJSON.getData(),
  });
  await sdb.close();
});
test("should list available tables when getTable cannot find one", async () => {
  const sdb = new SimpleDB();
  sdb.newTable("votes");
  sdb.newTable("districts");

  const error = await assertRejects(() => sdb.getTable("missing"));
  assert(error instanceof Error);
  expect(error.message).toStrictEqual(
    `getTable() could not find table "missing". Available tables: "districts", "votes".`,
  );

  await sdb.close();
});
test("should list missing and available tables for selectTables", async () => {
  const sdb = new SimpleDB();
  const votes = sdb.newTable("votes");
  votes.loadArray([{ id: 1 }]);
  const districts = sdb.newTable("districts");
  districts.loadArray([{ id: 1 }]);

  const error = await assertRejects(() => sdb.selectTables(["missingVotes", "missingDistricts"]));
  assert(error instanceof Error);
  expect(error.message).toStrictEqual(
    `selectTables() could not find tables "missingDistricts", "missingVotes". Available tables: "districts", "votes".`,
  );

  await sdb.close();
});
test("should retrieve a SimpleTable instance with geo data", async () => {
  const sdb = new SimpleDB();
  const tableJSON = sdb.newTable("tableGEOJSON");
  tableJSON.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");

  const tableJsonAgain = await sdb.getTable("tableGEOJSON");

  expect({
    instance: tableJsonAgain,
    name: tableJsonAgain.name,
    data: await tableJsonAgain.getGeoData(),
  }).toStrictEqual({
    instance: tableJSON,
    name: tableJSON.name,
    data: await tableJSON.getGeoData(),
  });
  await sdb.close();
});

test("should return table names", async () => {
  const sdb = new SimpleDB();
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);
  const tableCSV = sdb.newTable("tableCSV");
  tableCSV.loadData(["test/data/files/data.csv"]);

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? 1 : -1))).toStrictEqual(["tableCSV", "tableJSON"]);
  await sdb.close();
});

test("should return true when a table exists", async () => {
  const sdb = new SimpleDB();
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);

  expect(await sdb.hasTable("tableJSON")).toStrictEqual(true);
  await sdb.close();
});

test("should return false when a table doesn't exist", async () => {
  const sdb = new SimpleDB();
  const tableJSON = sdb.newTable("tableJSON");
  tableJSON.loadData(["test/data/files/data.json"]);

  expect(await sdb.hasTable("tableX")).toStrictEqual(false);
  await sdb.close();
});

test("should return the DuckDB extensions", async () => {
  const sdb = new SimpleDB();
  await sdb.getExtensions();
  // Not sure how to test. Different depending on the environment?
  await sdb.close();
});

test("should close the db", async () => {
  const sdb = new SimpleDB();
  await sdb.close();
  // How to test?
});

test("should explain when the connection closes before an async method finishes", async () => {
  const sdb = new SimpleDB();
  const logPromise = sdb
    .newTable("test")
    .loadArray([{ value: 1 }])
    .log();
  const rejection = assertRejects(
    () => logPromise,
    SDAError,
    "Database connection closed before all operations finished. Did you forget to add `await`?",
  );

  await sdb.close();
  await rejection;
});

test("file-backed close executes all pending work before cleanup", async () => {
  const file = `${output}pending_done.db`;
  const tempDir = `${output}pending_done.tmp`;
  const sdb = new SimpleDB({
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

  expect(first.pendingOps.length).toStrictEqual(0);
  expect(second.pendingOps.length).toStrictEqual(0);
  expect(existsSync(tempDir)).toStrictEqual(false);
  await assertRejects(() => sdb.connection.run("SELECT 1"));
});

test("should log SQL when logSQL is true", async () => {
  const sdb = new SimpleDB({ logSQL: true });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");

  // How to test?
  await test.run();
  await sdb.close();
});

test("should apply the default types option when logging", async () => {
  const sdb = new SimpleDB({ typesToLog: true });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await sdb
      .newTable("typed")
      .loadArray([{ name: "Alice" }])
      .log();
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("VARCHAR/string");
    expect(output).toContain("Alice");
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should apply the default row limit when logging", async () => {
  const sdb = new SimpleDB({ rowsToLog: 2 });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await sdb
      .newTable("limited")
      .loadArray([{ name: "Alice" }, { name: "Bob" }, { name: "Charlie" }])
      .log();
    const output = log.mock.calls.flat().join("\n");
    expect(output).toContain("Alice");
    expect(output).toContain("Bob");
    expect(output).not.toContain("Charlie");
    expect(log.mock.calls.at(-1)).toStrictEqual(["3 rows in total / showing 2 rows"]);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should apply the default character limit when logging", async () => {
  const sdb = new SimpleDB({ charsToLog: 5 });
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await sdb
      .newTable("truncated")
      .loadArray([{ name: "Charlie" }])
      .log();
    const output = stripVTControlCharacters(log.mock.calls.flat().join("\n"));
    expect(output).toContain("Ch...");
    expect(output).not.toContain("Charlie");
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should log the total duration", async () => {
  const sdb = new SimpleDB({ logDuration: true });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  // How to test?
  await test.run();
  await sdb.close();
});
test("should enable a progress bar", async () => {
  const sdb = new SimpleDB({ progressBar: true });
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");
  // How to test?
  await test.run();
  await sdb.close();
});
test("should write the db", async () => {
  const sdb = new SimpleDB();
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");

  await sdb.writeDB(`${output}database.db`, { overwrite: true });
  // How to test?
  await sdb.close();
});
test("should write the SQLite db", async () => {
  const sdb = new SimpleDB();
  const test = sdb.newTable("test");
  test.loadData("test/data/files/cities.csv");

  await sdb.writeDB(`${output}database.sqlite`, { overwrite: true });
  // How to test?
  await sdb.close();
});
test("should throw when writing the db with an unsupported extension", async () => {
  const sdb = new SimpleDB();
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
test("should load the db", async () => {
  const sdb = new SimpleDB();

  await sdb.loadDB(`${output}database.db`);
  // const test = await sdb.getTable("test");
  // await test.log();

  // How to test?
  await sdb.close();
});

test("should load the sqlite db", async () => {
  const sdb = new SimpleDB();

  await sdb.loadDB(`${output}database.sqlite`);
  // const test = await sdb.getTable("test");
  // await test.log();

  await sdb.close();
});
test("should throw when loading a db with an unsupported extension", async () => {
  const sdb = new SimpleDB();
  // loadDB() checks the file exists before checking its extension.
  writeFileSync(`${output}database.txt`, "");

  await assertRejects(
    () => sdb.loadDB(`${output}database.txt`),
    Error,
    "The extension txt is not supported",
  );

  await sdb.close();
});
test("should throw when loading a db file that doesn't exist", async () => {
  const sdb = new SimpleDB();

  await assertRejects(() => sdb.loadDB(`${output}notARealDatabase.db`), Error, "does not exist");

  await sdb.close();
});
test("should write the db with geometries", async () => {
  const sdb = new SimpleDB();
  const test = sdb.newTable("test");
  test.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  // await test.logProjections();
  // await test.log();

  await sdb.writeDB(`${output}database_geometry.db`, { overwrite: true });
  // How to test?
  await sdb.close();
});
test("should load the db with geometries", async () => {
  const sdb = new SimpleDB();
  await sdb.loadDB(`${output}database_geometry.db`);
  const test = await sdb.getTable("test");
  // await test.logProjections();
  test.simplify(0.1);
  // await test.log();
  // How to test?
  await test.run();
  await sdb.close();
});
test("should log table names and the empty database message", async () => {
  const sdb = new SimpleDB();
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  try {
    await sdb.logTableNames();
    expect(log.mock.calls.at(-1)).toStrictEqual(["\nSimpleDB - No tables found."]);
    sdb.newTable("first").loadArray([{ value: 1 }]);
    sdb.newTable("second").loadArray([{ value: 2 }]);
    await sdb.logTableNames();
    expect(log.mock.calls.at(-1)).toStrictEqual(['\nSimpleDB - Tables:  ["first","second"]']);
  } finally {
    log.mockRestore();
    await sdb.close();
  }
});

test("should instantiate by creating a new file", async () => {
  const sdb = new SimpleDB({
    file: `${output}database_new.db`,
    overwrite: true,
  });
  const data = sdb.newTable("data");
  data.loadData("test/data/files/data.csv");
  // await data.log();

  await data.run();
  await sdb.close();
});
test("should load a db created when instantiating", async () => {
  const sdb = new SimpleDB();
  await sdb.loadDB(`${output}database_new.db`);
  const data2 = sdb.newTable("data2");
  data2.loadData("test/data/files/data.csv");
  // await data2.log();

  await data2.run();
  await sdb.close();
});
test("should instantiate by creating a new file and geospatial data", async () => {
  const sdb = new SimpleDB({
    file: `${output}database_new_geo.db`,
    overwrite: true,
  });
  const data = sdb.newTable("geodata");
  data.loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");
  // await data.log();

  await data.run();
  await sdb.close();
});
test("should load a db created with geospatial data", async () => {
  const sdb = new SimpleDB();
  await sdb.loadDB(`${output}database_new_geo.db`);
  const data = await sdb.getTable("geodata");
  data.simplify(0.1);
  // await data.logProjections();
  // await data.log();

  await data.run();
  await sdb.close();
});
test("should preserve DuckDB's default external file cache setting for null", async () => {
  const nativeDb = await DuckDBInstance.create(":memory:");
  const connection = await nativeDb.connect();
  const sdb = new SimpleDB({ duckDbCache: null });
  try {
    const query = "SELECT current_setting('enable_external_file_cache') AS enabled";
    const defaults = (await connection.runAndReadAll(query)).getRowObjects();
    expect(await sdb.customQuery(query, { returnData: true })).toStrictEqual(defaults);
  } finally {
    connection.closeSync();
    nativeDb.closeSync();
    await sdb.close();
  }
});

test("should set the enable_external_file_cache option to true", async () => {
  const sdb = new SimpleDB({ duckDbCache: true });
  try {
    expect(
      await sdb.customQuery("SELECT current_setting('enable_external_file_cache') AS enabled", {
        returnData: true,
      }),
    ).toStrictEqual([{ enabled: true }]);
  } finally {
    await sdb.close();
  }
});

test("should set the enable_external_file_cache option to false", async () => {
  const sdb = new SimpleDB({ duckDbCache: false });
  try {
    expect(
      await sdb.customQuery("SELECT current_setting('enable_external_file_cache') AS enabled", {
        returnData: true,
      }),
    ).toStrictEqual([{ enabled: false }]);
  } finally {
    await sdb.close();
  }
});

test("should respect the data types when returning data with custom query", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();

  const data = [
    { date: new Date("2023-01-01"), value: 10 },
    { date: new Date("2023-02-01"), value: 20 },
    { date: new Date("2023-03-01"), value: 30 },
    { date: new Date("2023-04-01"), value: 40 },
  ];
  table.loadArray(data);

  const returnedData = await sdb.customQuery(`SELECT date, value FROM "${table.name}"`, {
    returnData: true,
    table: table.name,
  });

  expect(returnedData).toStrictEqual(data);
  await sdb.close();
});
test("should create a DB with bm25 index", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  table.bm25("italian food", "Dish", "Recipe", 10, { verbose: true });
  // await table.log(1);

  await sdb.writeDB(`${output}database_bm25.db`, { overwrite: true });

  // Just making sure it's doesnt crash for now
  expect(true).toStrictEqual(true);
  await sdb.close();
});
test("should load a DB with bm25 index", async () => {
  const sdb = new SimpleDB();
  await sdb.loadDB(`${output}database_bm25.db`);
  const table = await sdb.getTable("data");
  await table.getRowCount();
  // Just making sure it's doesnt crash for now
  expect(true).toStrictEqual(true);
  await sdb.close();
});
test("should instantiate by creating a new file and add bm25 index", async () => {
  const sdb = new SimpleDB({
    file: `${output}database_bm25_new.db`,
    overwrite: true,
  });
  const table = sdb.newTable("data");
  table.loadData("test/data/files/recipes.parquet");
  table.removeDuplicates({ on: "Dish" });

  table.bm25("italian food", "Dish", "Recipe", 10, { verbose: true });
  // await table.log(1);

  // Just making sure it's doesnt crash for now
  expect(true).toStrictEqual(true);
  await table.run();
  await sdb.close();
});
test("should load a DB instantiated with a file, with bm25 index", async () => {
  const sdb = new SimpleDB();
  await sdb.loadDB(`${output}database_bm25_new.db`);
  const table = await sdb.getTable("data");
  await table.getRowCount();
  // Just making sure it's doesnt crash for now
  expect(true).toStrictEqual(true);
  await sdb.close();
});
test("should preserve complete index definitions when writing and loading a DB", async () => {
  const file = `${output}database_index_definitions.db`;
  const sourceSdb = new SimpleDB();
  const sourceTable = sourceSdb.newTable("articles");
  sourceTable.loadArray([
    { id: 1, text: "fresh tomato pasta" },
    { id: 2, text: "chocolate cake" },
  ]);
  await sourceTable
    .createFtsIndex("id", "text", {
      stemmer: "english",
      lower: true,
      stripAccents: false,
    })
    .run();
  const expectedIndexes = structuredClone(sourceTable.indexes);

  await sourceSdb.writeDB(file, { overwrite: true });
  await sourceSdb.close();

  const loadedSdb = new SimpleDB();
  await loadedSdb.loadDB(file);
  const loadedTable = await loadedSdb.getTable("articles");
  expect(loadedTable.indexes).toStrictEqual(expectedIndexes);
  await loadedSdb.close();
});
test("should configure DuckDB's memory limit", async () => {
  const sdb = new SimpleDB({ memoryLimit: "1GiB" });
  try {
    expect(
      await sdb.customQuery("SELECT current_setting('memory_limit') AS memory", {
        returnData: true,
      }),
    ).toStrictEqual([{ memory: "1.0 GiB" }]);
  } finally {
    await sdb.close();
  }
});

test("should configure DuckDB's temporary directory", async () => {
  const tempDir = `${output}tmp`;
  const sdb = new SimpleDB({ tempDir });
  try {
    expect(
      await sdb.customQuery("SELECT current_setting('temp_directory') AS directory", {
        returnData: true,
      }),
    ).toStrictEqual([{ directory: tempDir }]);
  } finally {
    await sdb.close();
  }
});

test("persistent databases reopen existing tables and close without replacing the file", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "persistent.duckdb");
    const first = db({ file });
    await first
      .newTable("articles")
      .loadArray([
        {
          id: "one",
          text: "tomato pasta",
        },
      ])
      .createFtsIndex("id", "text")
      .run();
    const inode = nodeStatSync(file).ino;
    await first.close();
    expect(nodeStatSync(file).ino).toStrictEqual(inode);
    expect(existsSync(join(directory, "persistent_compacted.db"))).toStrictEqual(false);
    const second = db({ file });
    const table = await second.getTable("articles");
    expect(table.indexes.length).toStrictEqual(1);
    expect(await table.getData()).toStrictEqual([{ id: "one", text: "tomato pasta" }]);
    second.newTable("added").loadArray([{ id: 2 }]);
    await second.close();
    const third = db({ file, readOnly: true });
    expect(await third.getTableNames()).toStrictEqual(["added", "articles"]);
    expect(await (await third.getTable("added")).getData()).toStrictEqual([{ id: 2 }]);
  });
});

test("read-only databases reject modifications and leave files unchanged", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "readonly.db");
    const source = db({ file });
    source.newTable("data").loadArray([{ id: 1 }]);
    await source.close();
    const before = nodeReadFileSync(file);
    const readOnly = db({ file, readOnly: true });
    const table = await readOnly.getTable("data");
    expect(await table.getData()).toStrictEqual([{ id: 1 }]);
    await assertRejects(() => table.filter("id = 2").run(), Error, "read-only");
    await assertRejects(() => readOnly.loadDB(file), Error, "read-only");
    await readOnly.close();
    expect(nodeReadFileSync(file)).toStrictEqual(before);
    const noFile = db({ readOnly: true });
    await assertRejects(() => noFile.start(), Error, "readOnly requires");
    const incompatible = db({ file, readOnly: true, overwrite: true });
    await assertRejects(() => incompatible.start(), Error, "readOnly requires");
    expect(nodeReadFileSync(file)).toStrictEqual(before);
    const missing = db({ file: join(directory, "missing.db"), readOnly: true });
    await assertRejects(() => missing.start(), Error, "does not exist");
    expect(existsSync(join(directory, "missing.db"))).toStrictEqual(false);
  });
});

test("explicit persistent overwrite replaces existing contents", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "overwrite.db");
    const first = db({ file });
    first.newTable("old").loadArray([{ id: 1 }]);
    await first.close();
    const replacement = db({ file, overwrite: true });
    replacement.newTable("new").loadArray([{ id: 2 }]);
    await replacement.close();
    const reopened = db({ file, readOnly: true });
    expect(await reopened.getTableNames()).toStrictEqual(["new"]);
  });
});

test("persistent VSS indexes retain definitions and physical indexes after reopening", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "vectors.db");
    const first = db({ file });
    const table = first
      .newTable("vectors")
      .loadArray(
        [
          {
            id: 1,
            embedding: [0.1, 0.2, 0.3].map(Math.fround),
          },
        ],
        { columnTypes: { embedding: "FLOAT[3]" } },
      )
      .createVssIndex("embedding", { M: 8 });
    await first.close();
    const second = db({ file, readOnly: true });
    const restored = await second.getTable("vectors");
    expect(restored.indexes).toStrictEqual(table.indexes);
    expect(await restored.getRowCount()).toStrictEqual(1);
    expect(
      await second.customQuery("SELECT index_name FROM duckdb_indexes();", {
        returnData: true,
      }),
    ).toStrictEqual([{ index_name: table.indexes[0].name }]);
  });
});

test("persistent startup rejects newTable names already saved in the file", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "existing.db");
    const first = db({ file });
    first.newTable("existing").loadArray([{ id: 1 }]);
    await first.close();
    const second = db({ file });
    await assertRejects(
      () =>
        second
          .newTable("existing")
          .loadArray([{ id: 2 }])
          .run(),
      Error,
      "Use getTable()",
    );
    await second.close();
    const third = db({ file, readOnly: true });
    expect(await (await third.getTable("existing")).getData()).toStrictEqual([
      {
        id: 1,
      },
    ]);
  });
});

test("restored default table names skip gaps without collisions", async () => {
  await withDbFiles(async ({ directory, db }) => {
    const file = join(directory, "names.db");
    const first = db({ file });
    first.newTable("table1").loadArray([{ id: 1 }]);
    first.newTable("table3").loadArray([{ id: 3 }]);
    await first.close();
    const second = db({ file });
    await second.start();
    expect(second.newTable().name).toStrictEqual("table2");
    expect(second.newTable().name).toStrictEqual("table4");
  });
});

test("expressionSyntax defaults to JS shorthand for boolean columns and projections", async () => {
  const sdb = new SimpleDB();
  try {
    expect(sdb.expressionSyntax).toStrictEqual("js");
    const table = sdb.newTable().loadArray([
      { active: true, admin: false },
      {
        active: false,
        admin: false,
      },
    ]);
    expect(
      await table
        .filter("active || admin")
        .addColumn("allowed", "boolean", "active || admin")
        .getData(),
    ).toStrictEqual([{ active: true, admin: false, allowed: true }]);
    expect(
      await sdb.customQuery("SELECT false || true AS allowed, NULL == null AS missing", {
        returnData: true,
      }),
    ).toStrictEqual([{ allowed: true, missing: true }]);
  } finally {
    await sdb.close();
  }
});

test("SQL expressionSyntax preserves operators and null comparisons in queued and custom queries", async () => {
  const sdb = new SimpleDB({ expressionSyntax: "sql" });
  try {
    expect(sdb.expressionSyntax).toStrictEqual("sql");
    const table = sdb.newTable().loadArray([{ first: "Jane", last: "Doe" }]);
    expect(
      await table
        .addColumn("name", "string", "first || ' ' || last")
        .filter("name = 'Jane Doe'")
        .getData(),
    ).toStrictEqual([{ first: "Jane", last: "Doe", name: "Jane Doe" }]);
    expect(
      await sdb.customQuery("SELECT NULL = NULL AS missing, 'a' || 'b' AS joined", {
        returnData: true,
      }),
    ).toStrictEqual([{ missing: null, joined: "ab" }]);
    await assertRejects(() => sdb.customQuery("SELECT 1 === 1"));
  } finally {
    await sdb.close();
  }
});

test("expressionSyntax applies to stepwise operations and observer conditions", async () => {
  for (const expressionSyntax of ["js", "sql"] as const) {
    const sdb = new SimpleDB({ expressionSyntax });
    try {
      const table = sdb.newTable().loadArray([
        { a: true, b: false },
        {
          a: false,
          b: false,
        },
      ]);
      await table.run();
      const condition = expressionSyntax === "js" ? "a || b" : "a OR b";
      expect(await table.getData({ conditions: condition })).toStrictEqual([
        {
          a: true,
          b: false,
        },
      ]);
      expect(await table.filter(condition).getData()).toStrictEqual([
        {
          a: true,
          b: false,
        },
      ]);
    } finally {
      await sdb.close();
    }
  }
});

test("generated rowToText SQL works in both expression modes", async () => {
  for (const expressionSyntax of ["js", "sql"] as const) {
    const sdb = new SimpleDB({ expressionSyntax });
    try {
      expect(
        await sdb
          .newTable()
          .loadArray([{ name: "a || b" }])
          .rowToText(["name"], "text")
          .getData(),
      ).toStrictEqual([{ name: "a || b", text: "name:\na || b" }]);
    } finally {
      await sdb.close();
    }
  }
});

test("default JS mode combines obvious concatenation and logical OR across execution paths", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb
      .newTable()
      .loadArray([
        { first: "Jane", last: "Doe", active: true, admin: false },
        { first: "John", last: "Doe", active: false, admin: false },
      ])
      .addColumn("name", "string", "first || ' ' || last")
      .filter("(active || admin) && name === 'Jane Doe'");
    const expected = [
      {
        first: "Jane",
        last: "Doe",
        active: true,
        admin: false,
        name: "Jane Doe",
      },
    ];
    expect(await table.getData()).toStrictEqual(expected);
    const streamed = [];
    for await (const row of table.stream({
      conditions: "name || '!' === 'Jane Doe!' && (active || admin)",
    }))
      streamed.push(row);
    expect(streamed).toStrictEqual(expected);
    expect(
      await sdb.customQuery(
        "SELECT ('a' || 'b') || 'c' AS text, [true] || [false] AS items, CAST(true AS VARCHAR) || '!' AS castText, false || true AS allowed",
        { returnData: true },
      ),
    ).toStrictEqual([{ text: "abc", items: [true, false], castText: "true!", allowed: true }]);
  } finally {
    await sdb.close();
  }
});

test("table registration rejects case-insensitive name collisions", async () => {
  const sdb = new SimpleDB();
  try {
    const table = sdb.newTable("registeredSource").loadArray([{ value: 1 }]);
    assertThrows(() => sdb.newTable("REGISTEREDSOURCE"), Error, "already exists");
    expect(sdb.getTables()).toStrictEqual([table]);
    expect(await table.getData()).toStrictEqual([{ value: 1 }]);
    await table.removeTable();
    const replacement = sdb.newTable("REGISTEREDSOURCE").loadArray([{ value: 2 }]);
    assertThrows(() => table.loadArray([{ value: 3 }]), Error, "already exists");
    expect(sdb.getTables()).toStrictEqual([replacement]);
    expect(await replacement.getData()).toStrictEqual([{ value: 2 }]);
    expect(sdb.pendingCount).toStrictEqual(0);
  } finally {
    await sdb.close();
  }
});

test("table registration preserves DuckDB's distinct non-ASCII names", async () => {
  const sdb = new SimpleDB();
  try {
    const upper = sdb.newTable("É").loadArray([{ value: 1 }]);
    const lower = sdb.newTable("é").loadArray([{ value: 2 }]);
    expect(await upper.getData()).toStrictEqual([{ value: 1 }]);
    expect(await lower.getData()).toStrictEqual([{ value: 2 }]);
  } finally {
    await sdb.close();
  }
});
