import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";
import SimpleTable from "../../../src/class/SimpleTable.ts";

Deno.test("should load an array of objects into a table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    {
      key1: 1,
      key2: "un",
      key3: new Date("2010-01-01"),
      key4: true,
    },
    {
      key1: NaN,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    {
      key1: 3,
      key2: undefined,
      key3: new Date("2010-01-03"),
      key4: false,
    },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    { key1: 1, key2: "un", key3: new Date("2010-01-01"), key4: true },
    {
      key1: null,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    { key1: 3, key2: null, key3: new Date("2010-01-03"), key4: false },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  await sdb.close();
});

Deno.test("should load an array of objects into a table and return the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = await sdb.newTable().loadArray([
    {
      key1: 1,
      key2: "un",
      key3: new Date("2010-01-01"),
      key4: true,
    },
    {
      key1: NaN,
      key2: "deux",
      key3: new Date("2010-01-02"),
      key4: null,
    },
    {
      key1: 3,
      key2: undefined,
      key3: new Date("2010-01-03"),
      key4: false,
    },
    {
      key1: 4,
      key2: "quatre",
      key3: new Date("2010-01-04"),
      key4: false,
    },
  ]);

  assertEquals(table instanceof SimpleTable, true);
  await table.run();
  await sdb.close();
});

Deno.test("should load an array of objects into a table with spaces in column names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": "un",
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": "un",
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  await sdb.close();
});
Deno.test("should load an array of objects even if the first rows have null values", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": "deux",
    },
    {
      "column 1": 3,
      "column 2": "trois",
    },
    {
      "column 1": 4,
      "column 2": "quatre",
    },
  ]);

  await sdb.close();
});
Deno.test("should load an array of objects even if the all values in a column are null", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadArray([
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": null,
    },
    {
      "column 1": 3,
      "column 2": null,
    },
    {
      "column 1": 4,
      "column 2": null,
    },
  ]);

  const data = await table.getData();

  assertEquals(data, [
    {
      "column 1": 1,
      "column 2": null,
    },
    {
      "column 1": 2,
      "column 2": null,
    },
    {
      "column 1": 3,
      "column 2": null,
    },
    {
      "column 1": 4,
      "column 2": null,
    },
  ]);

  const types = await table.getTypes();

  assertEquals(types, {
    "column 1": "DOUBLE",
    "column 2": "VARCHAR",
  });

  await sdb.close();
});

Deno.test("should throw a clear error for an empty array", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("emptyArray");

  let error: unknown;
  try {
    table.loadArray([]);
  } catch (e) {
    error = e;
  }
  assertEquals(
    (error as Error).message,
    "The array is empty. loadArray needs at least one object to infer the column types.",
  );
  await sdb.close();
});

Deno.test("loadArray captures row, Date, and array values when queued", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable("capturedArray");
  const date = new Date("2020-01-02T03:04:05.000Z");
  const vector = [1, 2];
  const row = { name: "before", date, vector };
  const rows = [
    row,
    { name: "empty", date: null, vector: null },
  ];

  table.loadArray(rows);
  row.name = "after";
  date.setUTCFullYear(2030);
  vector[0] = 99;
  rows.push({
    name: "later",
    date: new Date("2040-01-01T00:00:00.000Z"),
    vector: [8, 9],
  });

  const result = await sdb.customQuery(
    `SELECT name, date, vector[1] AS first FROM "capturedArray"`,
    { returnData: true },
  );
  assertEquals(result, [
    {
      name: "before",
      date: new Date("2020-01-02T03:04:05.000Z"),
      first: 1,
    },
    { name: "empty", date: null, first: null },
  ]);

  await sdb.close();
});

Deno.test("library SQL supports double quotes in table and column names", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable('people "archive"');

  const result = await table
    .loadArray([{ 'full "name"': "Ada" }])
    .sort({ 'full "name"': "asc" })
    .getData({ columns: 'full "name"' });

  assertEquals(result, [{ 'full "name"': "Ada" }]);
  await sdb.close();
});
