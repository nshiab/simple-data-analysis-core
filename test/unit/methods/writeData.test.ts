import { test, expect } from "vite-plus/test";
import { assertRejects } from "../../helpers/assertions.ts";
import { existsSync, mkdirSync, readFileSync } from "node:fs";

import SimpleDB from "../../../src/class/SimpleDB.ts";

const output = "./test/output/";
if (!existsSync(output)) {
  mkdirSync(output);
}

const expectedData = [
  { key1: "1", key2: "2" },
  { key1: "3", key2: "coucou" },
  { key1: "8", key2: "10" },
  { key1: "brioche", key2: "croissant" },
];

test("should write a csv file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}test.csv`);

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData([`${output}test.csv`]);
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});

test("should write a csv file and create the path if it doesn't exist", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}subfolderData/test.csv`);

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData([`${output}subfolderData/test.csv`]);
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});

test("should write a compressed csv file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}test.csv`, {
    compression: true,
  });

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData([`${output}test.csv.gz`]);
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});

test("should write a json file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}test.json`);

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData([`${output}test.json`]);
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});
test("should write a json file with dates", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadArray([
    { key1: new Date("2025-01-01T01:23:10.987Z") },
    {
      key1: new Date("2025-04-08T14:09:24.155Z"),
    },
  ]);

  await table.writeData(`${output}date-test.json`, { formatDates: true });

  // We test the content of the file
  const tableCheck: unknown = JSON.parse(readFileSync(`${output}date-test.json`, "utf-8"));

  expect(tableCheck).toStrictEqual([
    { key1: "2025-01-01T01:23:10.987Z" },
    { key1: "2025-04-08T14:09:24.155Z" },
  ]);
  await sdb.close();
});
test("should write a json file with dates and keep the original table unchanged", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  const originalData = [
    { key1: new Date("2025-01-01T01:23:10.987Z") },
    {
      key1: new Date("2025-04-08T14:09:24.155Z"),
    },
  ];
  table.loadArray(originalData);

  await table.writeData(`${output}date-test.json`);

  const tableData = await table.getData();

  expect(tableData).toStrictEqual(originalData);
  await sdb.close();
});
test("should write a compressed json file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}test.json`, {
    compression: true,
  });

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData([`${output}test.json.gz`]);
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});

test("should write a parquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}test.parquet`);

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData([`${output}test.parquet`]);
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});

test("should write a compressed parquet file", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}testCompressed.parquet`, {
    compression: true,
  });

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData([`${output}testCompressed.parquet`]);
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});

test("should write a file at the root", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`testRoot.csv`);

  // We test the content of the file
  const tableCheck = sdb.newTable();
  tableCheck.loadData("testRoot.csv");
  const data = await tableCheck.getData();

  expect(data).toStrictEqual(expectedData);
  await sdb.close();
});

test("should write data as arrays", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadData("test/data/files/data.csv");
  await table.writeData(`${output}testRootArrays.json`, {
    dataAsArrays: true,
  });

  // We test the content of the file
  const data: unknown = JSON.parse(readFileSync(`${output}testRootArrays.json`, "utf-8"));

  expect(data).toStrictEqual({
    key1: ["1", "3", "8", "brioche"],
    key2: ["2", "coucou", "10", "croissant"],
  });
  await sdb.close();
});
for (const extension of ["db", "sqlite"]) {
  test(`should round-trip exported ${extension} data`, async () => {
    const source = new SimpleDB();
    const destination = new SimpleDB();
    try {
      const rows = [
        { id: 1, name: "Alice" },
        { id: 2, name: null },
      ];
      await source.newTable("exported").loadArray(rows).writeData(`${output}data.${extension}`);
      await source.close();
      await destination.loadDB(`${output}data.${extension}`);
      const table = await destination.getTable("exported");
      expect(await table.sort({ id: "asc" }).getData()).toStrictEqual(rows);
    } finally {
      await source.close();
      await destination.close();
    }
  });
}

test("writeData should throw an error when there is a geometry column and suggest using writeGeoData", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable();
  table.loadGeoData("test/geodata/files/polygons.geojson");

  await assertRejects(
    async () => {
      await table.writeData("${output}test.csv");
    },
    Error,
    "Table contains geometry columns. Use writeGeoData() instead.",
  );

  await sdb.close();
});
