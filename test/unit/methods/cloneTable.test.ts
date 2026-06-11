import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should clone a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable();

  assertEquals(await table.getData(), await clone.getData());
  await sdb.done();
});
Deno.test("should clone and log a table", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable();
  // await clone.logTable();

  assertEquals(await table.getData(), await clone.getData());
  await sdb.done();
});
Deno.test("should clone a table and give it a different name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable();

  assertEquals(table.name !== clone.name, true);
  await sdb.done();
});
Deno.test("should clone a table with a specific name", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({ outputTable: "clone" });

  assertEquals(await table.getData(), await clone.getData());
  await sdb.done();
});
Deno.test("should find the table name in the DB", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  await table.cloneTable({ outputTable: "clone" });

  const tables = await sdb.getTableNames();

  assertEquals(
    tables.sort((a, b) => (a > b ? -1 : 1)),
    ["data", "clone"],
  );
  await sdb.done();
});
Deno.test("should keep the original table intact", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable();
  await clone.addColumn("test", "number", "2");

  const originalTable = sdb.newTable("original");
  await originalTable.loadData("test/data/files/employees.csv");
  const originalData = await originalTable.getData();

  assertEquals(await table.getData(), originalData);
  await sdb.done();
});
Deno.test("should clone a table with a condition", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({
    conditions: `Job = 'Manager'`,
  });

  const originalTable = sdb.newTable("original");
  await originalTable.loadData("test/data/files/employees.csv");
  const originalData = await originalTable.getData();

  assertEquals(
    await clone.getData(),
    originalData.filter((d) => d.Job === "Manager"),
  );
  await sdb.done();
});
Deno.test("should clone a table with a specific name with spaces", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({ outputTable: "clone table" });

  assertEquals(await table.getData(), await clone.getData());
  await sdb.done();
});
Deno.test("should clone a table with a specific number of rows", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({ nbRows: 2 });

  const data = await table.getData();
  assertEquals(await clone.getData(), data.slice(0, 2));
  await sdb.done();
});
Deno.test("should clone a table with an offset", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({ offset: 2 });

  const data = await table.getData();
  assertEquals(await clone.getData(), data.slice(2));
  await sdb.done();
});
Deno.test("should clone a table with a specific number of rows and an offset", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({ nbRows: 2, offset: 2 });

  const data = await table.getData();
  assertEquals(await clone.getData(), data.slice(2, 4));
  await sdb.done();
});
Deno.test("should clone a table with conditions, nbRows and offset", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({
    conditions: `Job = 'Developer'`,
    nbRows: 2,
    offset: 1,
  });

  const data = await table.getData();
  assertEquals(
    await clone.getData(),
    data.filter((d) => d.Job === "Developer").slice(1, 3),
  );
  await sdb.done();
});
Deno.test("should clone a table with a specific name with spaces and '", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable({ outputTable: "clone 'table" });

  assertEquals(await table.getData(), await clone.getData());
  await sdb.done();
});
Deno.test("should clone a table with string parameter directly", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");
  const clone = await table.cloneTable("my_cloned_table");

  assertEquals(await table.getData(), await clone.getData());
  assertEquals(clone.name, "my_cloned_table");

  const tables = await sdb.getTableNames();
  assertEquals(tables.includes("my_cloned_table"), true);

  await sdb.done();
});

Deno.test("should clone a table with specific columns", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");

  const selectedColumns = ["Name", "Job"];

  const clone = await table.cloneTable({
    columns: selectedColumns,
  });

  const cloneColumns = await clone.getColumns();
  const cloneData = await clone.getData();
  const originalData = await table.getData();

  // Check that the clone only has the selected columns
  assertEquals(cloneColumns.sort(), selectedColumns.sort());

  // Check that the data matches for the selected columns
  const expectedData = originalData.map((row) => {
    const filteredRow: { [key: string]: unknown } = {};
    selectedColumns.forEach((col) => {
      filteredRow[col] = row[col];
    });
    return filteredRow;
  });

  assertEquals(cloneData, expectedData);

  await sdb.done();
});

Deno.test("should clone a table with specific columns and conditions", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  await table.loadData("test/data/files/employees.csv");

  const selectedColumns = ["Name", "Job"];
  const clone = await table.cloneTable({
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

  assertEquals(cloneData, expectedData);

  await sdb.done();
});
Deno.test("should clone a table with geo data", async () => {
  const sdb = new SimpleDB();
  const table = await sdb
    .newTable()
    .loadGeoData(
      "test/geodata/files/CanadianProvincesAndTerritories.json",
    );

  const cloned = await table.cloneTable();

  assertEquals(await table.getTypes(), await cloned.getTypes());
  assertEquals(await table.getNbRows(), await cloned.getNbRows());
  assertEquals(await table.getNbColumns(), await cloned.getNbColumns());

  await sdb.done();
});
