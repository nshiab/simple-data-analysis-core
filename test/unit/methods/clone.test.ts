import { test, expect } from "vite-plus/test";

import SimpleDB from "../../../src/class/SimpleDB.ts";

test("should clone a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone();

  expect(await table.getData()).toStrictEqual(await clone.getData());
  await sdb.run();
  await sdb.close();
});
test("should clone a table and give it a different name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone();

  expect(table.name !== clone.name).toStrictEqual(true);
  await sdb.run();
  await sdb.close();
});
test("should clone a table with a specific name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({ name: "clone" });

  expect(await table.getData()).toStrictEqual(await clone.getData());
  await sdb.run();
  await sdb.close();
});
test("should find the table name in the DB", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  table.clone({ name: "clone" });

  const tables = await sdb.getTableNames();

  expect(tables.sort((a, b) => (a > b ? -1 : 1))).toStrictEqual(["data", "clone"]);
  await sdb.run();
  await sdb.close();
});
test("should keep the original table intact", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone();
  clone.addColumn("test", "number", "2");

  const originalTable = sdb.newTable("original");
  originalTable.loadData("test/data/files/employees.csv");
  const originalData = await originalTable.getData();

  expect(await table.getData()).toStrictEqual(originalData);
  await sdb.run();
  await sdb.close();
});
test("should clone a table with a condition", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({
    conditions: `Job = 'Manager'`,
  });

  const originalTable = sdb.newTable("original");
  originalTable.loadData("test/data/files/employees.csv");
  const originalData = await originalTable.getData();

  expect(await clone.getData()).toStrictEqual(originalData.filter((d) => d.Job === "Manager"));
  await sdb.run();
  await sdb.close();
});
test("should clone a table with a specific name with spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({ name: "clone table" });

  expect(await table.getData()).toStrictEqual(await clone.getData());
  await sdb.run();
  await sdb.close();
});
test("should clone a table with a specific number of rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({ limit: 2 });

  const data = await table.getData();
  expect(await clone.getData()).toStrictEqual(data.slice(0, 2));
  await sdb.run();
  await sdb.close();
});
test("should clone a table with an offset", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({ offset: 2 });

  const data = await table.getData();
  expect(await clone.getData()).toStrictEqual(data.slice(2));
  await sdb.run();
  await sdb.close();
});
test("should clone a table with a specific number of rows and an offset", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({ limit: 2, offset: 2 });

  const data = await table.getData();
  expect(await clone.getData()).toStrictEqual(data.slice(2, 4));
  await sdb.run();
  await sdb.close();
});
test("should clone a table with conditions, limit and offset", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({
    conditions: `Job = 'Developer'`,
    limit: 2,
    offset: 1,
  });

  const data = await table.getData();
  expect(await clone.getData()).toStrictEqual(
    data.filter((d) => d.Job === "Developer").slice(1, 3),
  );
  await sdb.run();
  await sdb.close();
});
test("should clone a table with a specific name with spaces and '", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone({ name: "clone 'table" });

  expect(await table.getData()).toStrictEqual(await clone.getData());
  await sdb.run();
  await sdb.close();
});
test("should clone a table with string parameter directly", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const clone = table.clone("my_cloned_table");

  expect(await table.getData()).toStrictEqual(await clone.getData());
  expect(clone.name).toStrictEqual("my_cloned_table");

  const tables = await sdb.getTableNames();
  expect(tables.includes("my_cloned_table")).toStrictEqual(true);

  await sdb.run();
  await sdb.close();
});

test("should clone a table with specific columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");

  const selectedColumns = ["Name", "Job"];

  const clone = table.clone({
    columns: selectedColumns,
  });

  const cloneColumns = await clone.getColumns();
  const cloneData = await clone.getData();
  const originalData = await table.getData();

  // Check that the clone only has the selected columns
  expect(cloneColumns.sort()).toStrictEqual(selectedColumns.sort());

  // Check that the data matches for the selected columns
  const expectedData = originalData.map((row) => {
    const filteredRow: { [key: string]: unknown } = {};
    selectedColumns.forEach((col) => {
      filteredRow[col] = row[col];
    });
    return filteredRow;
  });

  expect(cloneData).toStrictEqual(expectedData);

  await sdb.run();
  await sdb.close();
});

test("should clone a table with specific columns and conditions", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");

  const selectedColumns = ["Name", "Job"];
  const clone = table.clone({
    columns: selectedColumns,
    conditions: `Job = 'Manager'`,
  });

  const cloneData = await clone.getData();
  const originalData = await table.getData();

  // Expected data: only Manager rows with only Name and Job columns
  const expectedData = originalData
    .filter((row) => row.Job === "Manager")
    .map((row) => ({
      Name: row.Name,
      Job: row.Job,
    }));

  expect(cloneData).toStrictEqual(expectedData);

  await sdb.run();
  await sdb.close();
});
test("should clone a table with geo data", async () => {
  const sdb = new SimpleDB();
  const table = sdb
    .newTable()
    .loadGeoData("test/geodata/files/CanadianProvincesAndTerritories.json");

  const cloned = table.clone();

  expect(await table.getTypes()).toStrictEqual(await cloned.getTypes());
  expect(await table.getRowCount()).toStrictEqual(await cloned.getRowCount());
  expect(await table.getColumnCount()).toStrictEqual(await cloned.getColumnCount());

  await sdb.run();
  await sdb.close();
});
