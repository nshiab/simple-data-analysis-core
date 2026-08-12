import { assertEquals } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should log a table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with 100 rows", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log(100);

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with 100 rows in options", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");

  let receivedCount: number | undefined;
  const getTop = table.getTop.bind(table);
  table.getTop = (
    count: number,
    options: { conditions?: string } = {},
  ) => {
    receivedCount = count;
    return getTop(count, options);
  };

  await table.log({ count: 100 });

  assertEquals(receivedCount, 100);
  await sdb.close();
});
Deno.test("should log a table with types", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ types: true });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should allow local types option to override the default", async () => {
  const sdb = new SimpleDB({ dataTransport: "file", typesToLog: true });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");

  let getTypesCalled = false;
  const getTypes = table.getTypes.bind(table);
  table.getTypes = () => {
    getTypesCalled = true;
    return getTypes();
  };

  await table.log({ types: false });

  assertEquals(getTypesCalled, false);
  await sdb.close();
});
Deno.test("should log a table with 100 rows and types", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ types: true, count: 100 });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should not throw an error when there is no table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("should log '<Geometry>' for geospatial data", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadGeoData(
    "test/geodata/files/CanadianProvincesAndTerritories.json",
  );
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});

Deno.test("should log types even if there is just one column in the table", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  table.selectColumns("Name");
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with a condition", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ conditions: `Name === 'OConnell, Donald'` });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with 'all'", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log("all");

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with { count: 'all'}", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/employees.csv");
  await table.log({ count: "all" });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log a table with long strings and word wrap the columns", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  table.loadData("test/data/files/recipes.parquet");
  await table.log();

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
Deno.test("should log different colors for different data types", async () => {
  const sdb = new SimpleDB({ dataTransport: "file" });
  const table = sdb.newTable();
  const dataArray = [
    {
      name: "Alice",
      age: 30,
      isStudent: false,
      birthday: new Date("1993-01-01"),
      salary: null,
    },
    {
      name: "Bob",
      age: 25,
      isStudent: true,
      birthday: new Date("1998-05-15"),
      salary: 50000,
    },
  ];
  console.table(dataArray);
  table.loadArray(dataArray);
  await table.log();
  await table.log({ types: true });

  // How to test?
  assertEquals(true, true);
  await sdb.close();
});
