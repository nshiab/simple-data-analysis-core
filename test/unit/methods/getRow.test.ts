import { assertEquals, assertRejects } from "@std/assert";
import SimpleDB from "../../../src/class/SimpleDB.ts";

Deno.test("should return a specific row", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const data = await table.getRow(`Name === 'Grant, Douglas'`);

  assertEquals(data, {
    Name: "Grant, Douglas",
    "Hire date": "13-JAN-08",
    Job: "Clerk",
    Salary: "NaN",
    "Department or unit": "50",
    "End-of_year-BONUS?": "23,39%",
  });
  await sdb.done();
});

Deno.test("should throw when no row matches", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");

  await assertRejects(
    () => table.getRow(`Name === 'Nobody'`),
    Error,
    "No row found",
  );
  await sdb.done();
});

Deno.test("should throw when more than one row matches", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");

  await assertRejects(
    () => table.getRow(`Job === 'Clerk'`),
    Error,
    "More than one row found",
  );
  await sdb.done();
});

Deno.test("should not throw when no row matches and strict is false", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const data = await table.getRow(`Name === 'Nobody'`, { strict: false });

  assertEquals(data, undefined);
  await sdb.done();
});

Deno.test("should return the first row when more than one row matches and strict is false", async () => {
  const sdb = new SimpleDB();
  const table = sdb.newTable("data");
  table.loadData("test/data/files/employees.csv");
  const data = await table.getRow(`Job === 'Clerk'`, { strict: false });

  assertEquals(typeof data, "object");
  assertEquals(data?.Job, "Clerk");
  await sdb.done();
});
